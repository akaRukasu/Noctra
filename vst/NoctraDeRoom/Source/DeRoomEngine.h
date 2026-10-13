// Noctra DeRoom — moteur de suppression de la résonance de pièce pour la voix.
//
// Moteur autonome (aucune dépendance) : FFT réelle maison, STFT 75 % de
// recouvrement, estimation statistique de la réverbération tardive avec un
// profil appris par bande de fréquence (durée de décroissance RT60 et niveau
// de queue). Les modes de la pièce (ondes stationnaires, « boîte ») ressortent
// dans ce profil comme des bandes qui sonnent plus longtemps que leurs voisines
// et sont visées en priorité. Les bandes où la voix directe domine nettement
// ne sont pas touchées.
//
// Tout est alloué dans prepare() : process() ne fait aucune allocation.

#pragma once

#include "VoiceFinish.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <vector>

namespace noctra
{

//==============================================================================
struct Cpx
{
    float re = 0.0f, im = 0.0f;
};

inline Cpx operator+ (Cpx a, Cpx b) { return { a.re + b.re, a.im + b.im }; }
inline Cpx operator- (Cpx a, Cpx b) { return { a.re - b.re, a.im - b.im }; }
inline Cpx operator* (Cpx a, Cpx b) { return { a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re }; }
inline Cpx operator* (float s, Cpx a) { return { s * a.re, s * a.im }; }
inline Cpx conj (Cpx a) { return { a.re, -a.im }; }
inline float norm2 (Cpx a) { return a.re * a.re + a.im * a.im; }

/** log10 approché (erreur < 0,005 dB en décibels), bien plus rapide que std::log10. */
inline float fastLog10 (float x)
{
    union { float f; uint32_t i; } v { x };
    const float e = (float) (int) ((v.i >> 23) & 0xff) - 127.0f;
    v.i = (v.i & 0x007fffff) | 0x3f800000; // mantisse dans [1, 2)
    const float m = v.f;
    const float log2m = -2.13388663f + (3.010851f + (-1.02955839f + 0.153924649f * m) * m) * m;
    return (e + log2m) * 0.30102999566f;
}

//==============================================================================
/** FFT réelle de taille n (puissance de 2) calculée par une FFT complexe de n/2. */
class RealFFT
{
public:
    void prepare (int size)
    {
        n = size;
        m = size / 2;

        int bits = 0;
        while ((1 << bits) < m)
            ++bits;

        rev.resize ((size_t) m);
        for (int i = 0; i < m; ++i)
        {
            int r = 0;
            for (int b = 0; b < bits; ++b)
                if (i & (1 << b))
                    r |= 1 << (bits - 1 - b);
            rev[(size_t) i] = r;
        }

        const double twoPi = 6.283185307179586476925;
        tw.resize ((size_t) std::max (1, m / 2));
        for (int i = 0; i < m / 2; ++i)
            tw[(size_t) i] = { (float) std::cos (twoPi * i / m), (float) -std::sin (twoPi * i / m) };

        post.resize ((size_t) m + 1);
        for (int k = 0; k <= m; ++k)
            post[(size_t) k] = { (float) std::cos (twoPi * k / n), (float) -std::sin (twoPi * k / n) };

        work.assign ((size_t) m, {});
    }

    int size() const { return n; }

    /** in : n réels ; out : n/2 + 1 bins complexes (non normalisé). */
    void forward (const float* in, Cpx* out)
    {
        for (int i = 0; i < m; ++i)
            work[(size_t) rev[(size_t) i]] = { in[2 * i], in[2 * i + 1] };

        transform (false);

        for (int k = 0; k <= m; ++k)
        {
            const Cpx zk = work[(size_t) (k == m ? 0 : k)];
            const Cpx zc = conj (work[(size_t) ((m - k) % m)]);
            const Cpx e = 0.5f * (zk + zc);
            const Cpx d = zk - zc;
            const Cpx o = { 0.5f * d.im, -0.5f * d.re }; // (zk - zc) / 2i
            out[k] = e + post[(size_t) k] * o;
        }
    }

    /** in : n/2 + 1 bins ; out : n réels (normalisé, inverse exact de forward). */
    void inverse (const Cpx* in, float* out)
    {
        for (int k = 0; k < m; ++k)
        {
            const Cpx xk = in[k];
            const Cpx xc = conj (in[m - k]);
            const Cpx e = 0.5f * (xk + xc);
            const Cpx o = (0.5f * (xk - xc)) * conj (post[(size_t) k]);
            work[(size_t) rev[(size_t) k]] = { e.re - o.im, e.im + o.re }; // e + i·o
        }

        transform (true);

        const float s = 1.0f / (float) m;
        for (int i = 0; i < m; ++i)
        {
            out[2 * i] = work[(size_t) i].re * s;
            out[2 * i + 1] = work[(size_t) i].im * s;
        }
    }

private:
    void transform (bool inverse)
    {
        Cpx* d = work.data();
        for (int len = 2; len <= m; len <<= 1)
        {
            const int half = len / 2;
            const int step = m / len;
            for (int i = 0; i < m; i += len)
            {
                for (int j = 0; j < half; ++j)
                {
                    Cpx w = tw[(size_t) (j * step)];
                    if (inverse)
                        w.im = -w.im;
                    const Cpx a = d[i + j];
                    const Cpx b = d[i + j + half] * w;
                    d[i + j] = a + b;
                    d[i + j + half] = a - b;
                }
            }
        }
    }

    int n = 0, m = 0;
    std::vector<int> rev;
    std::vector<Cpx> tw, post, work;
};

//==============================================================================
/** Annulation d'écho acoustique : retire du micro la musique jouée sur les enceintes.

    La musique arrive en sidechain (référence). Filtre adaptatif temporel exact en blocs
    fréquentiels partitionnés (MDF, recouvrement-sauvegarde) : un filtre par canal de
    référence, 200 ms de trajet enceintes → pièce → micro modélisés (latence aller-retour de
    la carte son comprise), sans latence ajoutée.
    Double filtre : un filtre « de fond » apprend en permanence (pas contrôlé à la Valin) ;
    le filtre « d'avant-plan », seul entendu, ne recopie le premier que lorsqu'il retire
    mesurablement plus. La voix (double parole) ne peut donc pas dégrader le son. */
class EchoCanceller
{
public:
    void prepare (int blockSize, double sampleRate, int maxRefs)
    {
        B = blockSize;
        F = B + 1;
        refs = std::max (1, maxRefs);
        parts = std::max (8, (int) std::ceil (0.2 * sampleRate / B));
        fft.prepare (2 * B);
        X.assign ((size_t) (refs * (parts + 1) * F), {});
        W.assign ((size_t) (refs * parts * F), {});
        Wfg.assign ((size_t) (refs * parts * F), {});
        Yfg.assign ((size_t) F, {});
        bgEcho.assign ((size_t) B, 0.0f);
        prevRef.assign ((size_t) refs, std::vector<float> ((size_t) B, 0.0f));
        buf.assign ((size_t) (2 * B), 0.0f);
        Y.assign ((size_t) F, {});
        E.assign ((size_t) F, {});
        xPow.assign ((size_t) F, 0.0f);

        reset();
    }

    void reset()
    {
        std::fill (X.begin(), X.end(), Cpx {});
        std::fill (W.begin(), W.end(), Cpx {});
        std::fill (Wfg.begin(), Wfg.end(), Cpx {});
        davgShort = davgLong = 0.0f;
        sffSmooth = 0.0f;
        for (auto& v : prevRef)
            std::fill (v.begin(), v.end(), 0.0f);
        head = 0;
        blocks = 0;
        inactiveBlocks = 1 << 20;
        micSum = errSum = 0.0f;
        erleDb = 0.0f;
        peakPart = 0;
    }

    /** Vide l'historique audio (transport) en gardant le trajet enceintes → micro appris. */
    void clearHistory()
    {
        std::fill (X.begin(), X.end(), Cpx {});
        for (auto& v : prevRef)
            std::fill (v.begin(), v.end(), 0.0f);
        inactiveBlocks = 1 << 20;
    }

    bool isActive() const { return inactiveBlocks <= parts + 2; }
    /** Efficacité de l'annulation (dB), mesurée quand la musique domine le micro. */
    float getEchoReductionDb() const { return erleDb; }
    /** Retard du trajet principal, en blocs (partition du filtre la plus énergique). */
    int getPeakDelayBlocks() const { return peakPart; }

    /** mic : B échantillons du micro mono ; ref : B échantillons par canal de musique.
        echoOut : écho estimé (B échantillons) à soustraire du micro. */
    void process (const float* mic, const float* const* ref, int nref, bool refActive, float* echoOut)
    {
        nref = std::min (nref, refs);
        inactiveBlocks = refActive ? 0 : inactiveBlocks + 1;
        if (! isActive())
        {
            std::fill (echoOut, echoOut + B, 0.0f);
            return;
        }
        ++blocks;
        head = (head + 1) % (parts + 1);

        // 1. Spectre de [bloc précédent ; bloc courant] de chaque référence.
        for (int r = 0; r < refs; ++r)
        {
            float* prev = prevRef[(size_t) r].data();
            for (int i = 0; i < B; ++i)
            {
                const float v = (refActive && r < nref) ? ref[r][i] : 0.0f;
                buf[(size_t) i] = prev[i];
                buf[(size_t) (B + i)] = v;
                prev[i] = v;
            }
            fft.forward (buf.data(), xAt (r, 0));
        }

        // 2. Échos prédits par les deux filtres : Σ W·X, dernière moitié de la convolution circulaire.
        std::fill (Y.begin(), Y.end(), Cpx {});
        std::fill (Yfg.begin(), Yfg.end(), Cpx {});
        std::fill (xPow.begin(), xPow.end(), 1.0e-9f);
        for (int r = 0; r < nref; ++r)
            for (int p = 0; p < parts; ++p)
            {
                const Cpx* x = xAt (r, p);
                const Cpx* w = wAt (r, p);
                const Cpx* wf = wfgAt (r, p);
                for (int k = 0; k < F; ++k)
                {
                    Y[(size_t) k].re += w[k].re * x[k].re - w[k].im * x[k].im;
                    Y[(size_t) k].im += w[k].re * x[k].im + w[k].im * x[k].re;
                    Yfg[(size_t) k].re += wf[k].re * x[k].re - wf[k].im * x[k].im;
                    Yfg[(size_t) k].im += wf[k].re * x[k].im + wf[k].im * x[k].re;
                    xPow[(size_t) k] += x[k].re * x[k].re + x[k].im * x[k].im;
                }
            }
        fft.inverse (Yfg.data(), buf.data());
        for (int i = 0; i < B; ++i)
            echoOut[i] = buf[(size_t) (B + i)];
        fft.inverse (Y.data(), buf.data());

        float eMic = 0.0f, eEcho = 0.0f, eErr = 0.0f, eBg = 0.0f, eEchoBg = 0.0f;
        for (int i = 0; i < B; ++i)
        {
            const float yb = buf[(size_t) (B + i)];
            const float eb = mic[i] - yb;
            const float ef = mic[i] - echoOut[i];
            bgEcho[(size_t) i] = yb;
            eMic += mic[i] * mic[i];
            eEcho += echoOut[i] * echoOut[i];
            eErr += ef * ef;
            eBg += eb * eb;
            eEchoBg += yb * yb;
            buf[(size_t) i] = 0.0f;
            buf[(size_t) (B + i)] = eb;
        }

        // Garde-fous : filtre de fond divergent → repart de l'avant-plan ; avant-plan aberrant → coupé.
        if (eEchoBg > 4.0f * eMic + 1.0e-9f)
        {
            W = Wfg;
            davgShort = davgLong = 0.0f;
            return;
        }
        if (eEcho > 4.0f * eMic + 1.0e-9f)
        {
            std::fill (Wfg.begin(), Wfg.end(), Cpx {});
            std::fill (echoOut, echoOut + B, 0.0f);
            eErr = eMic;
        }

        // Recopie fond → avant-plan quand le fond retire nettement plus, à court ET à long terme.
        if (refActive)
        {
            const float d = eErr - eBg;
            davgShort = 0.6f * davgShort + 0.4f * d;
            davgLong = 0.9f * davgLong + 0.1f * d;
            sffSmooth = 0.9f * sffSmooth + 0.1f * eErr;
            if (davgShort > 0.25f * sffSmooth && davgLong > 0.25f * sffSmooth)
            {
                Wfg = W;
                for (int i = 0; i < B; ++i)
                    echoOut[i] = bgEcho[(size_t) i];
                eEcho = eEchoBg;
                eErr = eBg;
                davgShort = davgLong = 0.0f;
            }
        }

        // Efficacité mesurée seulement quand la musique domine (sinon la voix fausserait la mesure).
        if (refActive && eEcho > 0.5f * eErr)
        {
            micSum = 0.99f * micSum + 0.01f * eMic;
            errSum = 0.99f * errSum + 0.01f * eErr;
            erleDb = 10.0f * std::log10 ((micSum + 1.0e-20f) / (errSum + 1.0e-20f));
        }

        if (! refActive)
            return;

        // 3. Adaptation NLMS du filtre de fond (pas fixe, régularisé) : les bins presque sans
        //    musique ne reçoivent pas un pas démesuré (sinon la voix y inscrirait du bruit).
        fft.forward (buf.data(), E.data());
        float meanX = 0.0f;
        for (int k = 0; k < F; ++k)
            meanX += xPow[(size_t) k];
        const float delta = regularisation * meanX / (float) F;
        for (int k = 0; k < F; ++k)
            E[(size_t) k] = (stepSize / (xPow[(size_t) k] + delta)) * E[(size_t) k];
        for (int r = 0; r < nref; ++r)
            for (int p = 0; p < parts; ++p)
            {
                const Cpx* x = xAt (r, p);
                Cpx* w = wAt (r, p);
                for (int k = 0; k < F; ++k)
                {
                    w[k].re += E[(size_t) k].re * x[k].re + E[(size_t) k].im * x[k].im;
                    w[k].im += E[(size_t) k].im * x[k].re - E[(size_t) k].re * x[k].im;
                }
            }

        // 4. Contrainte de causalité, une partition par bloc (coût réparti).
        const int c = (int) (blocks % (long long) (parts * nref));
        Cpx* w = wAt (c / parts, c % parts);
        fft.inverse (w, buf.data());
        std::fill (buf.begin() + B, buf.end(), 0.0f);
        fft.forward (buf.data(), w);

        // 5. Partition la plus énergique (retard du trajet principal), de temps en temps.
        if ((blocks & 63) == 0)
        {
            float best = 0.0f;
            for (int p = 0; p < parts; ++p)
            {
                float e = 0.0f;
                for (int r = 0; r < nref; ++r)
                {
                    const Cpx* wp = wfgAt (r, p);
                    for (int k = 0; k < F; k += 2)
                        e += norm2 (wp[k]);
                }
                if (e > best)
                {
                    best = e;
                    peakPart = p;
                }
            }
        }
    }

    float stepSize = 0.5f;
    float regularisation = 0.1f;

private:
    Cpx* xAt (int r, int p) { return &X[((size_t) r * (size_t) (parts + 1) + (size_t) ((head - p + parts + 1) % (parts + 1))) * (size_t) F]; }
    Cpx* wAt (int r, int p) { return &W[((size_t) r * (size_t) parts + (size_t) p) * (size_t) F]; }
    Cpx* wfgAt (int r, int p) { return &Wfg[((size_t) r * (size_t) parts + (size_t) p) * (size_t) F]; }

    int B = 256, F = 257, refs = 2, parts = 47, head = 0, peakPart = 0;
    long long blocks = 0;
    int inactiveBlocks = 1 << 20;
    float micSum = 0.0f, errSum = 0.0f, erleDb = 0.0f;
    RealFFT fft;
    std::vector<Cpx> X, W, Wfg, Y, Yfg, E;
    std::vector<float> bgEcho;
    float davgShort = 0.0f, davgLong = 0.0f, sffSmooth = 0.0f;
    std::vector<std::vector<float>> prevRef;
    std::vector<float> buf, xPow;
};

//==============================================================================
enum class MicProfile
{
    generic = 0,
    rodeNtUsb = 1 // RØDE NT-USB d'origine (USB-B) : cardioïde, 16 bits / 48 kHz, présence 5–10 kHz
};

struct DeRoomParams
{
    MicProfile mic = MicProfile::rodeNtUsb;
    float reduction = 0.7f;    // 0..1 : force de la suppression (0 = transparent)
    float resonance = 0.6f;    // 0..1 : précision et priorité données aux modes de la pièce
    float voiceProtect = 0.6f; // 0..1 : protection des composantes de voix directe
    float floorDb = -18.0f;    // atténuation maximale par bande (dB, <= 0)
    float mix = 1.0f;          // 0..1 : dosage traité / original
    float outputDb = 0.0f;     // gain de sortie (dB)
    bool learn = true;         // le profil de pièce continue de s'adapter
    bool listenRemoved = false;// écoute de ce qui est retiré
    bool bypass = false;       // original retardé (latence compensée)
    float musicRemoval = 0.8f; // 0..1 : retrait de la musique des enceintes (si sidechain branché)
    float finish = 0.6f;       // 0..1 : finition « studio / radio » (0 = aucune)
};

//==============================================================================
class DeRoomEngine
{
public:
    /** lowLatency : FFT deux fois plus courte (~11 ms au lieu de ~21 ms), pour le temps réel. */
    void prepare (double sampleRate, int maxChannels, bool lowLatency = false)
    {
        fs = sampleRate;
        fftSize = fs <= 50000.0 ? 1024 : (fs <= 100000.0 ? 2048 : 4096);
        if (lowLatency)
            fftSize /= 2;
        lowLatencyMode = lowLatency;
        hop = fftSize / 4;
        bins = fftSize / 2 + 1;
        numCh = std::max (1, maxChannels);
        hopSec = (double) hop / fs;

        fft.prepare (fftSize);

        window.resize ((size_t) fftSize);
        const double twoPi = 6.283185307179586476925;
        for (int i = 0; i < fftSize; ++i)
            window[(size_t) i] = (float) std::sqrt (0.5 - 0.5 * std::cos (twoPi * i / fftSize));

        // sqrt-Hann en analyse et en synthèse : Σ Hann à 75 % de recouvrement = 2.
        olaScale = 0.5f;

        inBuf.assign ((size_t) numCh, std::vector<float> ((size_t) fftSize, 0.0f));
        outAcc.assign ((size_t) numCh, std::vector<float> ((size_t) fftSize, 0.0f));
        outBuf.assign ((size_t) numCh, std::vector<float> ((size_t) hop, 0.0f));
        dryRing.assign ((size_t) numCh, std::vector<float> ((size_t) fftSize, 0.0f));
        spec.assign ((size_t) numCh, std::vector<Cpx> ((size_t) bins));
        refBuf.assign ((size_t) maxRefs, std::vector<float> ((size_t) fftSize, 0.0f));
        frame.assign ((size_t) fftSize, 0.0f);

        lateFrames = std::max (1, (int) std::lround (0.025 * fs / hop));        // ~25 ms : premières réflexions gardées
        peakSpan = 6 * lateFrames;                                              // ~150 ms de mémoire pour détecter les fins de syllabe
        bbSpan = 12 * lateFrames;                                               // ~300 ms d'historique large bande
        decayFrames = std::max (8, (int) std::lround (0.12 * fs / hop));        // ~120 ms de pente pour mesurer la décroissance

        const size_t b = (size_t) bins;
        P.assign (b, 0.0f);
        Ps.assign (b, 0.0f);
        Pprev.assign (b, 0.0f);
        noiseFloor.assign (b, 0.0f);
        u.assign (b, 0.0f);
        gainPrev.assign (b, 1.0f);
        gain.assign (b, 1.0f);
        gainSmooth.assign (b, 1.0f);
        gainDisplay.assign (b, 1.0f);
        aHop.assign (b, 0.0f);
        bandWeight.assign (b, 1.0f);
        aLate.assign (b, 0.0f);
        cEff.assign (b, 0.0f);
        modal.assign (b, 0.0f);
        qDisplay.assign (b, 0.0f);
        logRt.assign (b, (float) std::log (0.45));
        logC.assign (b, (float) std::log (0.02));
        tmpA.assign (b, 0.0f);
        tmpB.assign (b, 0.0f);
        prefix.assign (b + 1, 0.0);

        directHist.assign ((size_t) (lateFrames + 1), std::vector<float> (b, 0.0f));
        powHist.assign ((size_t) (peakSpan + 1), std::vector<float> (b, 0.0f));
        dbHist.assign ((size_t) decayFrames, std::vector<float> (b, -200.0f));
        bbHist.assign ((size_t) (bbSpan + 1), 0.0f);

        binLo = std::max (1, (int) std::floor (150.0 * fftSize / fs));
        binHi = std::min (bins - 1, (int) std::ceil (5000.0 * fftSize / fs));
        binHf = (int) std::lround (1000.0 * fftSize / fs);
        binVhf = (int) std::lround (4000.0 * fftSize / fs);

        aec.prepare (hop, fs, maxRefs);
        echoRes.assign ((size_t) bins, 0.0f);
        echoBuf.assign ((size_t) fftSize, 0.0f);
        monoHop.assign ((size_t) hop, 0.0f);
        tmpSpec.assign ((size_t) bins, {});
        refPowHist.assign ((size_t) std::max (2, (int) std::ceil (0.25 * fs / hop) + 1), std::vector<float> ((size_t) bins, 0.0f));
        refEnv.assign ((size_t) bins, 0.0f);
        errEnv.assign ((size_t) bins, 0.0f);
        resNum.assign ((size_t) bins, 0.0f);
        resDen.assign ((size_t) bins, 0.0f);
        musicEnvDecay = (float) std::pow (10.0, -6.0 * hopSec / 0.3); // queue de la pièce côté enceintes (~0,3 s)
        musicHoldFrames = (int) std::lround (0.5 / hopSec);

        // Régression linéaire sur decayFrames points d'abscisse 0..M-1.
        const double M = decayFrames;
        sumX = M * (M - 1) / 2.0;
        sumXX = (M - 1) * M * (2 * M - 1) / 6.0;

        smoothCoef = 1.0f - (float) std::exp (-1.0 / (0.02 * fs)); // lissage 20 ms du mix et du gain
        displayCoef = 1.0f - (float) std::exp (-hopSec / 0.25);

        nfRise = (float) std::pow (10.0, 0.3 * hopSec);     // plancher de bruit : remonte de 3 dB/s
        finisher.prepare (fs, numCh);
        computeBandWeights (target.mic);
        resetStreaming();
        updateProfile();
    }

    int getLatencySamples() const { return fftSize; }
    bool isLowLatency() const { return lowLatencyMode; }
    float getFinishGainDb() const { return finisher.getGainDb(); }
    int getNumBins() const { return bins; }
    int getFftSize() const { return fftSize; }
    double getSampleRate() const { return fs; }

    /** Vide les tampons audio (transport) sans oublier le profil appris. */
    void resetStreaming()
    {
        for (auto* set : { &inBuf, &outAcc, &outBuf, &dryRing })
            for (auto& v : *set)
                std::fill (v.begin(), v.end(), 0.0f);
        for (auto& v : directHist) std::fill (v.begin(), v.end(), 0.0f);
        for (auto& v : powHist) std::fill (v.begin(), v.end(), 0.0f);
        for (auto& v : dbHist) std::fill (v.begin(), v.end(), -200.0f);
        std::fill (bbHist.begin(), bbHist.end(), 0.0f);
        std::fill (u.begin(), u.end(), 0.0f);
        std::fill (Ps.begin(), Ps.end(), 0.0f);
        std::fill (Pprev.begin(), Pprev.end(), 0.0f);
        std::fill (gainPrev.begin(), gainPrev.end(), 1.0f);
        std::fill (gainSmooth.begin(), gainSmooth.end(), 1.0f);
        for (auto& v : refBuf)
            std::fill (v.begin(), v.end(), 0.0f);
        std::fill (echoRes.begin(), echoRes.end(), 0.0f);
        std::fill (echoBuf.begin(), echoBuf.end(), 0.0f);
        std::fill (refEnv.begin(), refEnv.end(), 0.0f);
        for (auto& v : refPowHist)
            std::fill (v.begin(), v.end(), 0.0f);
        aec.clearHistory();
        finisher.reset();
        hopPos = 0;
        dryPos = 0;
        frameIndex = 0;
        mixState = target.bypass ? 0.0f : target.mix;
        outGainState = dbToGain (target.outputDb);
    }

    /** Oublie le profil de pièce et repart d'une hypothèse neutre. */
    void resetLearning()
    {
        std::fill (noiseFloor.begin(), noiseFloor.end(), 0.0f);
        std::fill (logRt.begin(), logRt.end(), (float) std::log (0.45));
        std::fill (logC.begin(), logC.end(), (float) std::log (0.02));
        updateProfile();
    }

    void setParams (const DeRoomParams& p) { target = p; }

    /** Profil appris : log RT60 (s) et log niveau de queue, un point par bin. */
    void getProfile (std::vector<float>& rtOut, std::vector<float>& cOut) const
    {
        rtOut = logRt;
        cOut = logC;
    }

    /** Recharge un profil (éventuellement calculé à une autre fréquence d'échantillonnage). */
    void setProfile (const float* rtIn, const float* cIn, int srcBins, double srcFs)
    {
        if (srcBins < 2 || srcFs <= 0.0)
            return;
        const double srcHz = srcFs / (2.0 * (srcBins - 1));
        const double dstHz = fs / (double) fftSize;
        for (int k = 0; k < bins; ++k)
        {
            const double x = std::min ((double) (srcBins - 1), k * dstHz / srcHz);
            const int i0 = std::min (srcBins - 2, (int) x);
            const float t = (float) (x - i0);
            logRt[(size_t) k] = std::clamp (rtIn[i0] + t * (rtIn[i0 + 1] - rtIn[i0]), logRtMin, logRtMax);
            logC[(size_t) k] = std::clamp (cIn[i0] + t * (cIn[i0 + 1] - cIn[i0]), logCMin, logCMax);
        }
        updateProfile();
    }

    /** Musique des enceintes : réduction obtenue par l'annulation d'écho (dB), active ou non. */
    float getMusicReductionDb() const { return aec.getEchoReductionDb(); }
    bool isMusicActive() const { return aec.isActive(); }
    /** Retard enceintes → micro estimé (ms), -1 tant qu'il n'est pas trouvé. */
    float getMusicDelayMs() const { return (float) (aec.getPeakDelayBlocks() * hopSec * 1000.0); }
    /** Oublie le trajet enceintes → micro appris. */
    void resetMusicPath()
    {
        aec.reset();
        std::fill (resNum.begin(), resNum.end(), 0.0f);
        std::fill (resDen.begin(), resDen.end(), 0.0f);
    }

    /** Atténuation moyenne récente par bin (linéaire, 1 = intact). */
    const float* getGainDisplay() const { return gainDisplay.data(); }
    /** Rapport réverbération / voix directe appris par bin (dB). */
    const float* getRoomDisplay() const { return qDisplay.data(); }

    void process (float* const* channels, int numChannels, int numSamples)
    {
        process (channels, numChannels, nullptr, 0, numSamples);
    }

    /** refs : musique envoyée aux enceintes (sidechain), ou nullptr. */
    void process (float* const* channels, int numChannels, const float* const* refs, int numRefs, int numSamples)
    {
        const int nc = std::min (numChannels, numCh);
        const int nr = refs != nullptr ? std::min (numRefs, maxRefs) : 0;
        const float mixTarget = target.bypass ? 0.0f : std::clamp (target.mix, 0.0f, 1.0f);
        const float gainTarget = target.bypass ? 1.0f : dbToGain (target.outputDb);
        const bool listen = target.listenRemoved && ! target.bypass;

        for (int i = 0; i < numSamples; ++i)
        {
            mixState += smoothCoef * (mixTarget - mixState);
            outGainState += smoothCoef * (gainTarget - outGainState);

            for (int ch = 0; ch < nc; ++ch)
            {
                const float x = channels[ch][i];
                inBuf[(size_t) ch][(size_t) (fftSize - hop + hopPos)] = x;

                float& slot = dryRing[(size_t) ch][(size_t) dryPos];
                const float dry = slot;
                slot = x;

                const float wet = outBuf[(size_t) ch][(size_t) hopPos];
                const float y = listen ? (dry - wet) : (dry + mixState * (wet - dry));
                channels[ch][i] = y * outGainState;
            }

            for (int ch = nc; ch < numCh; ++ch)
                inBuf[(size_t) ch][(size_t) (fftSize - hop + hopPos)] = 0.0f;
            for (int r = 0; r < maxRefs; ++r)
                refBuf[(size_t) r][(size_t) (fftSize - hop + hopPos)] = r < nr ? refs[r][i] : 0.0f;

            if (++dryPos == fftSize)
                dryPos = 0;

            if (++hopPos == hop)
            {
                hopPos = 0;
                processFrame (nc, nr);
            }
        }

        // Finition studio / radio sur le signal final (pas sur l'écoute du retiré ni en bypass).
        if (! listen && ! target.bypass)
            finisher.process (channels, nc, numSamples, target.finish);
    }

private:
    static float dbToGain (float db) { return std::pow (10.0f, db / 20.0f); }

    //==========================================================================
    void processFrame (int nc, int nr)
    {
        const size_t K = (size_t) bins;

        // 0. Musique des enceintes (sidechain) : annulation d'écho temporelle sur le bloc le plus récent.
        bool refActive = false;
        if (nr > 0 && target.musicRemoval > 0.0f && ! target.bypass)
            for (int r = 0; r < nr && ! refActive; ++r)
            {
                double e = 0.0;
                for (float v : refBuf[(size_t) r])
                    e += (double) v * v;
                refActive = e > 1.0e-9 * fftSize; // musique au-dessus de -90 dBFS
            }

        std::memmove (echoBuf.data(), echoBuf.data() + hop, sizeof (float) * (size_t) (fftSize - hop));
        float* echoHop = echoBuf.data() + (fftSize - hop);
        if (refActive || aec.isActive())
        {
            const float inv = 1.0f / (float) std::max (1, nc);
            for (int i = 0; i < hop; ++i)
            {
                float m = 0.0f;
                for (int ch = 0; ch < nc; ++ch)
                    m += inBuf[(size_t) ch][(size_t) (fftSize - hop + i)];
                monoHop[(size_t) i] = m * inv;
            }
            const float* refHop[maxRefs];
            for (int r = 0; r < maxRefs; ++r)
                refHop[r] = refBuf[(size_t) r].data() + (fftSize - hop);
            aec.process (monoHop.data(), refHop, nr, refActive, echoHop);
            for (int ch = 0; ch < nc; ++ch)
                for (int i = 0; i < hop; ++i)
                    inBuf[(size_t) ch][(size_t) (fftSize - hop + i)] -= echoHop[i];
        }
        else
            std::fill (echoHop, echoHop + hop, 0.0f);
        const bool music = aec.isActive();
        framesSinceMusic = music ? 0 : framesSinceMusic + 1;

        // 1. Analyse des canaux micro (écho déjà retiré).
        for (int ch = 0; ch < nc; ++ch)
        {
            const float* src = inBuf[(size_t) ch].data();
            for (int i = 0; i < fftSize; ++i)
                frame[(size_t) i] = src[i] * window[(size_t) i];
            fft.forward (frame.data(), spec[(size_t) ch].data());
        }

        // 1b. Résidu de musique laissé par l'annulation : enveloppe de la musique (alignée sur le retard
        //     du trajet principal) × gain de fuite moyen, appris quand le micro est dominé par la musique.
        if (music)
            estimateMusicResidual (nc, nr, refActive);
        else
            for (size_t k = 0; k < K; ++k)
                echoRes[k] *= 0.85f;

        // Puissance moyenne des canaux (traitement stéréo lié).
        std::fill (P.begin(), P.end(), 0.0f);
        for (int ch = 0; ch < nc; ++ch)
        {
            const Cpx* X = spec[(size_t) ch].data();
            for (size_t k = 0; k < K; ++k)
                P[k] += norm2 (X[k]);
        }
        const float inv = 1.0f / (float) std::max (1, nc);
        float bb = 0.0f;
        for (size_t k = 0; k < K; ++k)
        {
            P[k] = P[k] * inv + 1.0e-20f;
            Ps[k] = 0.5f * Ps[k] + 0.5f * P[k];
            // Pendant la musique, le plancher de bruit ne peut que baisser : la musique n'est pas du « bruit de fond ».
            // Il ne s'initialise (0 = inconnu) et ne bouge qu'en dehors de la musique.
            if (! music)
                noiseFloor[k] = noiseFloor[k] <= 0.0f ? Ps[k] : std::min (Ps[k] + 1.0e-20f, noiseFloor[k] * nfRise);
            if ((int) k >= binLo && (int) k <= binHi)
                bb += Ps[k];
        }

        // 2. Réverbération tardive prédite : u = a·u + a^D·direct(n - D), réverbe = c·u.
        const int ring = lateFrames + 1;
        const auto& direct = directHist[(size_t) ((frameIndex + 1) % ring)]; // direct(n - D)
        for (size_t k = 0; k < K; ++k)
            u[k] = aHop[k] * u[k] + aLate[k] * direct[k];

        // 3. Gains (Wiener à SIR a priori « decision-directed »).
        const float reduction = std::clamp (target.reduction, 0.0f, 1.0f);
        const float beta = 2.0f * reduction;
        const float resonance = std::clamp (target.resonance, 0.0f, 1.0f);
        const float vp = std::clamp (target.voiceProtect, 0.0f, 1.0f);
        const float floorLin = dbToGain (std::min (0.0f, target.floorDb));
        const float echoAmount = target.bypass ? 0.0f : 6.0f * std::clamp (target.musicRemoval, 0.0f, 1.0f);
        const float alphaDD = 0.88f - 0.28f * vp;
        const float protectDb = 13.0f - 7.0f * vp;

        auto& slotDirect = directHist[(size_t) (frameIndex % ring)];

        if (target.mic != weightProfile)
            computeBandWeights (target.mic);

        for (size_t k = 0; k < K; ++k)
        {
            const float rev = cEff[k] * u[k];
            slotDirect[k] = std::max (P[k] - rev, 0.0f);

            float g = 1.0f;
            // Résidu de musique laissé par l'annulation d'écho, traité comme la réverbe.
            const float lamEcho = echoAmount * echoRes[k];
            if (beta > 0.0f || lamEcho > 0.0f)
            {
                const float lam = beta * bandWeight[k] * (1.0f + 1.6f * resonance * modal[k]) * rev + lamEcho + 1.0e-20f;
                const float gamma = P[k] / lam;
                const float xi = alphaDD * (gainPrev[k] * gainPrev[k] * Pprev[k] / lam)
                               + (1.0f - alphaDD) * std::max (gamma - 1.0f, 0.0f);
                // Soustraction en puissance : |sortie|² ≈ |voix directe|², sans sur-atténuation.
                g = std::sqrt (xi / (1.0f + xi));

                // Composantes où la voix directe domine nettement : on n'y touche pas.
                const float gdb = 10.0f * fastLog10 (gamma + 1.0e-20f);
                const float s = std::clamp ((gdb - protectDb) / 6.0f, 0.0f, 1.0f);
                g += (1.0f - g) * s * (0.35f + 0.65f * vp);

                // Jamais sous le bruit de fond de la pièce / du micro : pas de « pompage » du souffle.
                const float keepNoise = std::sqrt (std::min (1.0f, noiseMeanFactor * noiseFloor[k] / P[k]));
                g = std::max (g, std::max (floorLin, keepNoise));

                // Montée instantanée (attaques intactes), descente adoucie (pas de bruit musical).
                if (g < gainSmooth[k])
                    g = gainSmooth[k] + 0.55f * (g - gainSmooth[k]);
            }
            gainSmooth[k] = g;
            gainPrev[k] = g;
            Pprev[k] = P[k];
        }

        // Lissage fréquentiel au-dessus de 1 kHz, plus large au-dessus de 4 kHz.
        gain[0] = gainSmooth[0];
        gain[K - 1] = gainSmooth[K - 1];
        for (size_t k = 1; k + 1 < K; ++k)
        {
            if ((int) k < binHf)
                gain[k] = gainSmooth[k];
            else if ((int) k < binVhf || k + 2 >= K)
                gain[k] = 0.25f * gainSmooth[k - 1] + 0.5f * gainSmooth[k] + 0.25f * gainSmooth[k + 1];
            else
                gain[k] = 0.1f * gainSmooth[k - 2] + 0.2f * gainSmooth[k - 1] + 0.4f * gainSmooth[k]
                        + 0.2f * gainSmooth[k + 1] + 0.1f * gainSmooth[k + 2];
        }

        for (size_t k = 0; k < K; ++k)
            gainDisplay[k] += displayCoef * (gain[k] - gainDisplay[k]);

        // 4. Apprentissage du profil de pièce.
        const int histNow = (int) (frameIndex % (peakSpan + 1));
        for (size_t k = 0; k < K; ++k)
            powHist[(size_t) histNow][k] = Ps[k];
        bbHist[(size_t) (frameIndex % (bbSpan + 1))] = bb;
        auto& dbNow = dbHist[(size_t) (frameIndex % decayFrames)];
        for (size_t k = 0; k < K; ++k)
            dbNow[k] = 10.0f * fastLog10 (Ps[k] + 1.0e-20f);

        // Pendant la musique, la pièce n'est apprise qu'une fois l'annulation d'écho efficace
        // (le résidu de musique est alors traité comme du bruit de fond).
        const bool musicClean = framesSinceMusic > musicHoldFrames || aec.getEchoReductionDb() > 12.0f;
        if (target.learn && frameIndex > bbSpan + decayFrames && musicClean)
            learn (histNow);

        if ((frameIndex & 31) == 0) // le profil évolue lentement : ~6 fois par seconde suffit
            updateProfile();

        // 5. Synthèse.
        for (int ch = 0; ch < nc; ++ch)
        {
            Cpx* X = spec[(size_t) ch].data();
            for (size_t k = 0; k < K; ++k)
                X[k] = gain[k] * X[k];
            fft.inverse (X, frame.data());

            float* acc = outAcc[(size_t) ch].data();
            for (int i = 0; i < fftSize; ++i)
                acc[i] += frame[(size_t) i] * window[(size_t) i] * olaScale;

            std::memcpy (outBuf[(size_t) ch].data(), acc, sizeof (float) * (size_t) hop);
            std::memmove (acc, acc + hop, sizeof (float) * (size_t) (fftSize - hop));
            std::fill (acc + fftSize - hop, acc + fftSize, 0.0f);
        }

        for (int ch = 0; ch < numCh; ++ch)
        {
            float* in = inBuf[(size_t) ch].data();
            std::memmove (in, in + hop, sizeof (float) * (size_t) (fftSize - hop));
        }

        ++frameIndex;
    }

    //==========================================================================
    float bbAt (int framesAgo) const
    {
        const int len = (int) bbHist.size();
        return bbHist[(size_t) (((frameIndex - framesAgo) % len + len) % len)];
    }

    float bbMax (int fromAgo, int toAgo) const
    {
        float m = 0.0f;
        for (int j = fromAgo; j <= toAgo; ++j)
            m = std::max (m, bbAt (j));
        return m;
    }

    void estimateMusicResidual (int nc, int nr, bool refActive)
    {
        const size_t K = (size_t) bins;
        const int histLen = (int) refPowHist.size();
        refPowPos = (refPowPos + 1) % histLen;
        float* now = refPowHist[(size_t) refPowPos].data();
        std::fill (now, now + K, 0.0f);
        if (refActive)
            for (int r = 0; r < nr; ++r)
            {
                const float* src = refBuf[(size_t) r].data();
                for (int i = 0; i < fftSize; ++i)
                    frame[(size_t) i] = src[i] * window[(size_t) i];
                fft.forward (frame.data(), tmpSpec.data());
                for (size_t k = 0; k < K; ++k)
                    now[k] += norm2 (tmpSpec[k]);
            }

        for (int i = 0; i < fftSize; ++i)
            frame[(size_t) i] = echoBuf[(size_t) i] * window[(size_t) i];
        fft.forward (frame.data(), tmpSpec.data());

        const int d = std::min (aec.getPeakDelayBlocks(), histLen - 1);
        const float* aligned = refPowHist[(size_t) ((refPowPos - d + histLen) % histLen)].data();
        const float inv = 1.0f / (float) std::max (1, nc);
        for (size_t k = 0; k < K; ++k)
        {
            Cpx e {};
            for (int ch = 0; ch < nc; ++ch)
                e = e + spec[(size_t) ch][k];
            e = inv * e;
            const float ep = norm2 (e);
            const float yp = norm2 (tmpSpec[k]);
            refEnv[k] = std::max (aligned[k], musicEnvDecay * refEnv[k]);
            errEnv[k] = 0.6f * errEnv[k] + 0.4f * ep;
            if (refActive && yp > 0.3f * norm2 (e + tmpSpec[k]))
            {
                resNum[k] = 0.97f * resNum[k] + 0.03f * errEnv[k];
                resDen[k] = 0.97f * resDen[k] + 0.03f * refEnv[k];
            }
            const float g = resDen[k] > 1.0e-20f ? std::min (resNum[k] / resDen[k], 1.0f) : 1.0f;
            echoRes[k] = g * refEnv[k];
        }
    }

    void learn (int histNow)
    {
        const size_t K = (size_t) bins;
        const float bbNow = bbAt (0);

        // Fin de syllabe : l'énergie large bande a chuté de 10 dB par rapport aux 25–150 ms
        // précédentes, et continue de baisser (pas de nouvelle attaque).
        if (bbNow > 0.1f * bbMax (lateFrames, peakSpan) || bbNow > 1.05f * bbAt (1))
            return;

        // La pente n'est mesurée que si toute la fenêtre est déjà dans la queue (début de chute exclu).
        const int M = decayFrames;
        const bool cleanDecay = bbAt (M - 1) < 0.25f * bbMax (M, bbSpan);

        const int newest = (int) (frameIndex % M);
        const double denom = M * sumXX - sumX * sumX;

        for (size_t k = 1; k < K; ++k)
        {
            const float nf = noiseFloor[k] + echoRes[k]; // bruit de fond + résidu de musique

            float pk = 0.0f;
            for (int j = lateFrames; j <= peakSpan; ++j)
                pk = std::max (pk, powHist[(size_t) ((histNow - j + 2 * (peakSpan + 1)) % (peakSpan + 1))][k]);

            if (pk < nf * 100.0f || Ps[k] > pk * 0.25f) // pas de signal avant, ou chute < 6 dB dans ce bin
                continue;

            // a) Niveau de queue : moyenne robuste du rapport mesuré / prédit
            //    (écrêtée pour qu'une trame encore teintée de voix directe ne la tire pas vers le haut).
            // Le suivi de minimum sous-estime le bruit moyen d'environ 4 dB (bruit 16 bits du NT-USB).
            const float tail = std::max (Ps[k] - noiseMeanFactor * nf, 0.0f);
            const float c = std::exp (logC[k]);
            const float ratio = std::min (tail / (u[k] + 1.0e-20f), 4.0f * c + 1.0e-3f);
            logC[k] = std::clamp (std::log (c + 0.03f * (ratio - c) + 1.0e-12f), logCMin, logCMax);

            if (! cleanDecay)
                continue;

            // b) Durée de décroissance : pente des M dernières trames, si elle est propre.
            double sy = 0.0, sxy = 0.0, syy = 0.0;
            for (int x = 0; x < M; ++x)
            {
                const double y = dbHist[(size_t) ((newest + 1 + x) % M)][k];
                sy += y;
                sxy += x * y;
                syy += y * y;
            }
            const double slope = (M * sxy - sumX * sy) / denom;     // dB par trame
            if (slope >= -0.02)
                continue;
            const double varY = M * syy - sy * sy;
            const double r2 = varY > 0.0 ? (slope * slope * denom) / varY : 0.0;
            const double drop = -slope * (M - 1);
            const float lastDb = dbHist[(size_t) newest][k];
            if (r2 < 0.85 || drop < 3.0 || lastDb < 10.0f * std::log10 (nf) + 6.0f)
                continue;

            const double rt = 60.0 / (-slope / hopSec);
            const float lrt = (float) std::log (std::clamp (rt, 0.05, 4.0));
            logRt[k] = std::clamp (logRt[k] + (lrt > logRt[k] ? 0.02f : -0.02f), logRtMin, logRtMax);
        }
    }

    /** Lisse le profil appris selon la précision demandée et précalcule les coefficients. */
    void updateProfile()
    {
        const size_t K = (size_t) bins;
        const float resonance = std::clamp (target.resonance, 0.0f, 1.0f);
        const float detail = 0.25f + 0.75f * resonance;

        smoothAcross (logRt, tmpA, 0.18);   // tendance large (≈ ±1/4 d'octave)
        smoothAcross (logC, tmpB, 0.18);

        const int binModeHi = (int) std::lround (1500.0 * fftSize / fs);
        const int binModeFade = (int) std::lround (800.0 * fftSize / fs);

        for (size_t k = 0; k < K; ++k)
        {
            // Détail local (3 bins) pour suivre les modes étroits.
            const size_t k0 = k > 0 ? k - 1 : k, k1 = k + 1 < K ? k + 1 : k;
            const float rtLocal = (logRt[k0] + 2.0f * logRt[k] + logRt[k1]) * 0.25f;
            const float cLocal = (logC[k0] + 2.0f * logC[k] + logC[k1]) * 0.25f;

            const float lrt = tmpA[k] + detail * (rtLocal - tmpA[k]);
            const float lc = tmpB[k] + detail * (cLocal - tmpB[k]);

            const double a = decayPerHop (lrt);
            aHop[k] = (float) a;
            aLate[k] = (float) std::pow (a, (double) lateFrames);
            cEff[k] = std::exp (lc);

            // Rapport réverbe/direct en régime établi : q = c·a^D / (1 - a).
            const double q = steadyRatio (lc, lrt);
            const double qSmooth = steadyRatio (tmpB[k], tmpA[k]);
            qDisplay[k] = (float) (10.0 * std::log10 (q + 1.0e-9));

            // Mode de pièce : bande qui résonne nettement plus que ses voisines (sous 1,5 kHz).
            float m = (float) std::clamp (std::log (q / std::max (qSmooth, 1.0e-12)) / std::log (4.0), 0.0, 1.0);
            const int ki = (int) k;
            if (ki >= binModeHi)
                m = 0.0f;
            else if (ki > binModeFade)
                m *= 1.0f - (float) (ki - binModeFade) / (float) std::max (1, binModeHi - binModeFade);
            modal[k] = m;
        }
    }

    /** Pondération de la suppression selon le micro. */
    void computeBandWeights (MicProfile mic)
    {
        weightProfile = mic;
        for (int k = 0; k < bins; ++k)
        {
            const double hz = k * fs / fftSize;
            float w = 1.0f;
            if (mic == MicProfile::rodeNtUsb)
            {
                // Cardioïde : peu de réverbe captée dans l'aigu, et la bosse de présence 5–10 kHz
                // porte les sibilantes et l'air de la voix : suppression adoucie au-dessus de 5 kHz.
                if (hz > 5000.0)
                    w = (float) (1.0 - 0.45 * std::min (1.0, std::log2 (hz / 5000.0) / std::log2 (12000.0 / 5000.0)));
            }
            bandWeight[(size_t) k] = w;
        }
    }

    double decayPerHop (float logRtValue) const
    {
        return std::pow (10.0, -6.0 * hopSec / std::exp ((double) logRtValue));
    }

    double steadyRatio (float logCValue, float logRtValue) const
    {
        const double a = decayPerHop (logRtValue);
        return std::exp ((double) logCValue) * std::pow (a, (double) lateFrames) / std::max (1.0e-6, 1.0 - a);
    }

    /** Moyenne glissante en fréquence de largeur proportionnelle à la fréquence. */
    void smoothAcross (const std::vector<float>& src, std::vector<float>& dst, double rel)
    {
        const int K = bins;
        prefix[0] = 0.0;
        for (int k = 0; k < K; ++k)
            prefix[(size_t) k + 1] = prefix[(size_t) k] + src[(size_t) k];
        for (int k = 0; k < K; ++k)
        {
            const int w = std::max (2, (int) std::lround (k * rel));
            const int lo = std::max (0, k - w), hi = std::min (K - 1, k + w);
            dst[(size_t) k] = (float) ((prefix[(size_t) hi + 1] - prefix[(size_t) lo]) / (hi - lo + 1));
        }
    }

    //==========================================================================
    static constexpr float noiseMeanFactor = 2.5f;
    static constexpr float logRtMin = -2.9957f; // 0,05 s
    static constexpr float logRtMax = 1.3863f;  // 4 s
    static constexpr float logCMin = -9.2103f;  // 1e-4
    static constexpr float logCMax = 0.6931f;   // 2

    double fs = 48000.0, hopSec = 0.0;
    int fftSize = 1024, hop = 256, bins = 513, numCh = 2;
    int lateFrames = 5, peakSpan = 30, bbSpan = 60, decayFrames = 22;
    int binLo = 3, binHi = 107, binHf = 21, binVhf = 85;
    int hopPos = 0, dryPos = 0;
    long long frameIndex = 0;
    double sumX = 0.0, sumXX = 0.0;
    float olaScale = 0.5f, smoothCoef = 0.001f, displayCoef = 0.02f, nfRise = 1.0f;
    float mixState = 1.0f, outGainState = 1.0f;

    DeRoomParams target;
    RealFFT fft;
    EchoCanceller aec;
    VoiceFinisher finisher;
    bool lowLatencyMode = false;
    static constexpr int maxRefs = 2;
    int musicHoldFrames = 94, framesSinceMusic = 1 << 20;
    std::vector<std::vector<float>> refBuf;
    std::vector<float> echoRes, echoBuf, monoHop, refEnv, errEnv, resNum, resDen;
    std::vector<Cpx> tmpSpec;
    std::vector<std::vector<float>> refPowHist;
    int refPowPos = 0;
    float musicEnvDecay = 0.8f;

    std::vector<float> window, frame;
    std::vector<std::vector<float>> inBuf, outAcc, outBuf, dryRing;
    std::vector<std::vector<Cpx>> spec;

    std::vector<float> P, Ps, Pprev, noiseFloor, u, gainPrev, gain, gainSmooth, gainDisplay;
    std::vector<float> bandWeight;
    MicProfile weightProfile = MicProfile::generic;
    std::vector<float> aHop, aLate, cEff, modal, qDisplay, logRt, logC, tmpA, tmpB;
    std::vector<double> prefix;
    std::vector<std::vector<float>> directHist, powHist, dbHist;
    std::vector<float> bbHist;
};

} // namespace noctra
