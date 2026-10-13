// Banc d'essai hors DAW du moteur Noctra DeRoom.
//
// Une voix synthétique (impulsions glottiques + formants, syllables et pauses)
// est passée dans des pièces simulées (premières réflexions, queue diffuse,
// modes résonants). On mesure :
//  - la réverbe retirée dans les pauses (large bande et sur les modes) ;
//  - la fidélité pendant la parole vis-à-vis de la voix « proche » idéale
//    (son direct + premières réflexions, ce qu'un bon dé-réverbérateur garde) ;
//  - la transparence sur une voix sèche (le plugin ne doit pas l'abîmer) ;
//  - l'alignement exact de la latence annoncée.
//
// g++ -O2 -std=c++17 -I../Source engine_test.cpp -o engine_test && ./engine_test

#include "DeRoomEngine.h"

#include <chrono>
#include <cstdlib>
#include <cstdio>
#include <random>
#include <string>

using namespace noctra;

namespace
{
constexpr double kFs = 48000.0;
constexpr double kPi = 3.14159265358979323846;

struct Voice
{
    std::vector<float> x;
    std::vector<unsigned char> active; // 1 pendant la parole
};

// Résonateur à deux pôles (formant).
struct Reson
{
    double b1 = 0, b2 = 0, g = 0, y1 = 0, y2 = 0;
    void set (double f, double bw)
    {
        const double r = std::exp (-kPi * bw / kFs);
        b1 = 2.0 * r * std::cos (2.0 * kPi * f / kFs);
        b2 = -r * r;
        g = 1.0 - r;
    }
    double tick (double in)
    {
        const double y = g * in + b1 * y1 + b2 * y2;
        y2 = y1;
        y1 = y;
        return y;
    }
};

Voice makeVoice (double seconds, unsigned seed)
{
    std::mt19937 rng (seed);
    std::uniform_real_distribution<double> uni (0.0, 1.0);
    std::normal_distribution<double> gauss (0.0, 1.0);

    const int n = (int) (seconds * kFs);
    Voice v;
    v.x.assign ((size_t) n, 0.0f);
    v.active.assign ((size_t) n, 0);

    const double vowels[5][3] = { { 730, 1090, 2440 }, { 270, 2290, 3010 }, { 300, 870, 2240 },
                                  { 530, 1840, 2480 }, { 570, 840, 2410 } };

    int pos = (int) (0.3 * kFs);
    double phase = 0.0;
    while (pos < n - (int) (0.6 * kFs))
    {
        const bool fricative = uni (rng) < 0.18;
        const int len = (int) ((fricative ? 0.07 + 0.08 * uni (rng) : 0.14 + 0.24 * uni (rng)) * kFs);
        const double* F = vowels[(int) (uni (rng) * 5) % 5];
        Reson r[3];
        r[0].set (F[0], 80);
        r[1].set (F[1], 100);
        r[2].set (F[2], 140);
        Reson hp;
        hp.set (4500, 3000);
        const double f0a = 115 + 70 * uni (rng), f0b = 115 + 70 * uni (rng);
        const double amp = 0.5 + 0.5 * uni (rng);

        for (int i = 0; i < len && pos + i < n; ++i)
        {
            const double t = (double) i / len;
            const double att = std::min (1.0, i / (0.015 * kFs));
            const double rel = std::min (1.0, (len - i) / (0.03 * kFs));
            const double env = amp * std::sin (0.5 * kPi * att) * std::sin (0.5 * kPi * rel);
            double s;
            if (fricative)
            {
                s = 0.25 * hp.tick (gauss (rng)) * 6.0;
            }
            else
            {
                const double f0 = f0a + (f0b - f0a) * t + 3.0 * std::sin (2 * kPi * 5.5 * (pos + i) / kFs);
                phase += 2 * kPi * f0 / kFs;
                if (phase > 2 * kPi * 1000.0)
                    phase -= 2 * kPi * 1000.0;
                double src = 0.0;
                const int H = (int) (5000.0 / f0);
                for (int h = 1; h <= H; ++h)
                    src += std::sin (h * phase) / h;
                s = 0.0;
                for (auto& rr : r)
                    s += rr.tick (src) * 4.0;
                s += 0.004 * gauss (rng); // souffle
            }
            v.x[(size_t) (pos + i)] = (float) (env * s);
            v.active[(size_t) (pos + i)] = 1;
        }
        pos += len;
        // pause (parfois enchaînement direct)
        const double gap = uni (rng) < 0.25 ? 0.0 : 0.08 + 0.25 * uni (rng);
        pos += (int) (gap * kFs);
    }

    // normalisation -12 dBFS crête
    float peak = 1.0e-9f;
    for (float s : v.x)
        peak = std::max (peak, std::abs (s));
    for (float& s : v.x)
        s *= 0.25f / peak;
    return v;
}

struct Room
{
    std::string name;
    double rt = 0.4;          // queue diffuse
    double drrDb = 3.0;       // énergie directe / énergie après 2 ms
    std::vector<double> modeHz, modeRt;
    double modeShare = 0.5;   // part de l'énergie réverbérée portée par les modes
};

// Réponse impulsionnelle : complète, et partie « à garder » (direct + 25 ms).
void makeIR (const Room& room, unsigned seed, std::vector<float>& full, std::vector<float>& early)
{
    std::mt19937 rng (seed);
    std::normal_distribution<double> gauss (0.0, 1.0);
    const int n = (int) (2.5 * kFs);
    std::vector<double> late ((size_t) n, 0.0), modes ((size_t) n, 0.0), er ((size_t) n, 0.0);

    er[0] = 1.0;
    const double taps[6][2] = { { 2.9, 0.55 }, { 4.7, -0.42 }, { 7.3, 0.35 }, { 11.0, -0.28 }, { 16.0, 0.22 }, { 21.0, -0.18 } };
    for (auto& t : taps)
        er[(size_t) (t[0] * 1e-3 * kFs)] += t[1];

    double lp = 0.0;
    for (int i = (int) (0.004 * kFs); i < n; ++i)
    {
        const double t = i / kFs;
        const double fade = std::min (1.0, (t - 0.004) / 0.02);
        lp += 0.35 * (gauss (rng) - lp);
        late[(size_t) i] = fade * lp * std::exp (-6.9078 * t / room.rt);
    }
    for (size_t m = 0; m < room.modeHz.size(); ++m)
    {
        const double ph = 6.28 * (m * 0.37);
        for (int i = (int) (0.002 * kFs); i < n; ++i)
        {
            const double t = i / kFs;
            modes[(size_t) i] += std::sin (2 * kPi * room.modeHz[m] * t + ph) * std::exp (-6.9078 * t / room.modeRt[m]);
        }
    }

    auto energy = [] (const std::vector<double>& v, int from) {
        double e = 0;
        for (size_t i = (size_t) from; i < v.size(); ++i)
            e += v[i] * v[i];
        return e;
    };
    // drrDb : énergie directe / énergie réverbérée tardive (après 25 ms).
    const int e25 = (int) (0.025 * kFs);
    const double eLate = 1.0 / std::pow (10.0, room.drrDb / 10.0);
    const double gL = std::sqrt (eLate * (1 - room.modeShare) / std::max (1e-12, energy (late, e25)));
    const double gM = room.modeHz.empty() ? 0.0 : std::sqrt (eLate * room.modeShare / energy (modes, e25));

    full.assign ((size_t) n, 0.0f);
    early.assign ((size_t) n, 0.0f);
    const int keep = (int) (0.025 * kFs);
    for (int i = 0; i < n; ++i)
    {
        const double v = er[(size_t) i] + gL * late[(size_t) i] + gM * modes[(size_t) i];
        full[(size_t) i] = (float) v;
        if (i < keep)
            early[(size_t) i] = (float) (v * (i < keep - 240 ? 1.0 : (keep - i) / 240.0));
    }
}

std::vector<float> convolve (const std::vector<float>& a, const std::vector<float>& b)
{
    int N = 1;
    while (N < (int) (a.size() + b.size()))
        N <<= 1;
    RealFFT f;
    f.prepare (N);
    std::vector<float> A ((size_t) N, 0.0f), B ((size_t) N, 0.0f);
    std::copy (a.begin(), a.end(), A.begin());
    std::copy (b.begin(), b.end(), B.begin());
    std::vector<Cpx> FA ((size_t) N / 2 + 1), FB ((size_t) N / 2 + 1);
    f.forward (A.data(), FA.data());
    f.forward (B.data(), FB.data());
    for (size_t k = 0; k < FA.size(); ++k)
        FA[k] = FA[k] * FB[k];
    f.inverse (FA.data(), A.data());
    A.resize (a.size());
    return A;
}

bool gLowLatency = false;

struct Learned
{
    std::vector<float> rt, c, qDb;
};

// Musique stéréo synthétique : accords, basse, grosse caisse, caisse claire, charleston.
void makeMusic (double seconds, unsigned seed, std::vector<float>& L, std::vector<float>& R)
{
    std::mt19937 rng (seed);
    std::uniform_real_distribution<double> uni (0.0, 1.0);
    std::normal_distribution<double> gauss (0.0, 1.0);
    const int n = (int) (seconds * kFs);
    L.assign ((size_t) n, 0.0f);
    R.assign ((size_t) n, 0.0f);
    const double scale[7] = { 0, 2, 3, 5, 7, 8, 10 };
    const int beat = (int) (0.25 * kFs); // 120 BPM en croches
    double ph[4] = { 0, 0, 0, 0 }, bassPh = 0;
    double notes[4] = { 220, 261, 329, 392 }, bass = 55;
    double snare = 0, hat = 0, kick = 0, kickPh = 0;
    for (int i = 0; i < n; ++i)
    {
        const int step = i / beat, pos = i % beat;
        if (pos == 0)
        {
            if (step % 8 == 0)
            {
                const int root = (int) (uni (rng) * 7);
                for (int v = 0; v < 4; ++v)
                    notes[v] = 220.0 * std::pow (2.0, (scale[(root + 2 * v) % 7] + 12 * ((root + 2 * v) / 7)) / 12.0);
                bass = notes[0] / 4;
            }
            if (step % 4 == 0) { kick = 1.0; kickPh = 0; }
            if (step % 4 == 2) snare = 1.0;
            hat = 0.6;
        }
        double sig = 0;
        for (int v = 0; v < 4; ++v)
        {
            ph[v] += 2 * kPi * notes[v] / kFs;
            sig += 0.12 * (std::sin (ph[v]) + 0.4 * std::sin (2 * ph[v]) + 0.2 * std::sin (3 * ph[v]));
        }
        bassPh += 2 * kPi * bass / kFs;
        const double b = 0.35 * std::sin (bassPh) * (0.6 + 0.4 * std::exp (-pos / (0.1 * kFs)));
        kickPh += 2 * kPi * (50 + 90 * kick) / kFs;
        const double k = 0.8 * kick * std::sin (kickPh);
        kick *= std::exp (-1.0 / (0.06 * kFs));
        const double sn = 0.35 * snare * gauss (rng);
        snare *= std::exp (-1.0 / (0.08 * kFs));
        const double ht = 0.08 * hat * gauss (rng);
        hat *= std::exp (-1.0 / (0.02 * kFs));
        L[(size_t) i] = (float) (0.9 * sig + b + k + sn + ht);
        R[(size_t) i] = (float) (1.1 * sig + b + k + 0.8 * sn + 1.3 * ht);
    }
    float peak = 1e-9f;
    for (size_t i = 0; i < L.size(); ++i)
        peak = std::max ({ peak, std::abs (L[i]), std::abs (R[i]) });
    for (size_t i = 0; i < L.size(); ++i)
    {
        L[i] *= 0.4f / peak;
        R[i] *= 0.4f / peak;
    }
}

// Trajet enceinte → micro : retard (latence aller-retour + air), réflexions, queue de pièce.
std::vector<float> speakerPath (double delayMs, double gainDb, double rt, unsigned seed)
{
    std::mt19937 rng (seed);
    std::normal_distribution<double> gauss (0.0, 1.0);
    const int n = (int) (0.8 * kFs);
    std::vector<float> h ((size_t) n, 0.0f);
    const int d = (int) (delayMs * 1e-3 * kFs);
    const double g = std::pow (10.0, gainDb / 20.0);
    h[(size_t) d] = (float) g;
    const double taps[4][2] = { { 1.7, 0.5 }, { 3.9, -0.35 }, { 6.2, 0.3 }, { 9.5, -0.2 } };
    for (auto& t : taps)
        h[(size_t) (d + (int) (t[0] * 1e-3 * kFs))] += (float) (g * t[1]);
    double lp = 0;
    for (int i = d + (int) (0.004 * kFs); i < n; ++i)
    {
        const double t = (i - d) / kFs;
        lp += 0.4 * (gauss (rng) - lp);
        h[(size_t) i] += (float) (g * 0.12 * lp * std::exp (-6.9078 * t / rt));
    }
    return h;
}

std::vector<float> runEngine (const std::vector<float>& in, const DeRoomParams& p, int passes, double* msPerSec = nullptr,
                              Learned* learned = nullptr, const std::vector<float>* refL = nullptr,
                              const std::vector<float>* refR = nullptr, float* musicDb = nullptr)
{
    DeRoomEngine e;
    e.setParams (p);
    e.prepare (kFs, 2, gLowLatency);
    std::vector<float> L, R;
    const int block = 512;
    for (int pass = 0; pass < passes; ++pass)
    {
        L = in;
        R = in;
        e.resetStreaming();
        const auto t0 = std::chrono::steady_clock::now();
        for (size_t i = 0; i < in.size(); i += block)
        {
            const int n = (int) std::min ((size_t) block, in.size() - i);
            float* ch[2] = { L.data() + i, R.data() + i };
            if (refL != nullptr)
            {
                const float* rf[2] = { refL->data() + i, refR->data() + i };
                e.process (ch, 2, rf, 2, n);
            }
            else
                e.process (ch, 2, n);
        }
        const auto t1 = std::chrono::steady_clock::now();
        const double ms = std::chrono::duration<double, std::milli> (t1 - t0).count() / (in.size() / kFs);
        if (msPerSec)
            *msPerSec = pass == 0 ? ms : std::min (*msPerSec, ms); // meilleur passage : machine partagée
    }
    if (musicDb)
        *musicDb = e.getMusicReductionDb();
    if (learned)
    {
        e.getProfile (learned->rt, learned->c);
        learned->qDb.assign (e.getRoomDisplay(), e.getRoomDisplay() + e.getNumBins());
    }
    // compensation de latence
    const int lat = e.getLatencySamples();
    std::vector<float> out (in.size(), 0.0f);
    for (size_t i = 0; i + (size_t) lat < in.size(); ++i)
        out[i] = L[i + (size_t) lat];
    return out;
}

// Énergies par trame et par bande, via STFT 1024 / 512.
struct Spectro
{
    int frames = 0, bins = 513;
    std::vector<float> pw; // frames × bins
};

Spectro spectro (const std::vector<float>& x)
{
    const int N = 1024, H = 512;
    Spectro s;
    s.frames = (int) (x.size() / H) - 2;
    s.pw.assign ((size_t) s.frames * 513, 0.0f);
    RealFFT f;
    f.prepare (N);
    std::vector<float> buf ((size_t) N);
    std::vector<Cpx> X (513);
    for (int t = 0; t < s.frames; ++t)
    {
        for (int i = 0; i < N; ++i)
            buf[(size_t) i] = x[(size_t) (t * H + i)] * (float) (0.5 - 0.5 * std::cos (2 * kPi * i / N));
        f.forward (buf.data(), X.data());
        for (int k = 0; k < 513; ++k)
            s.pw[(size_t) t * 513 + (size_t) k] = norm2 (X[(size_t) k]) + 1e-14f;
    }
    return s;
}

struct Metrics
{
    double tailWide = 0, tailModes = 0, speechLevel = 0, lsdIn = 0, lsdOut = 0;
    double bandIn = 0, bandOut = 0;   // distance par bandes 1/3 d'octave (dB)
    double cutStrong = 0;             // perte moyenne sur les composantes fortes de la voix (dB, <= 0)
    std::vector<double> bandHz, bandBiasIn, bandBiasOut; // écart signé moyen par bande pendant la parole
};

// cible : voix proche idéale ; in : capté ; out : traité. Tous alignés.
Metrics measure (const Voice& v, const std::vector<float>& target, const std::vector<float>& in,
                 const std::vector<float>& out, const std::vector<double>& modeHz)
{
    const Spectro T = spectro (target), I = spectro (in), O = spectro (out);
    const int H = 512, N = 1024;
    const int kLo = 2, kHi = 470; // ~90 Hz – 22 kHz
    std::vector<int> modeBins;
    for (double f : modeHz)
        for (int d = -1; d <= 1; ++d)
            modeBins.push_back ((int) std::lround (f * N / kFs) + d);

    double eTailIn = 0, eTailOut = 0, eModIn = 0, eModOut = 0, eSpT = 0, eSpO = 0;
    double lsdI = 0, lsdO = 0, bI = 0, bO = 0, cut = 0;
    std::vector<double> sumBi (40, 0.0), sumBo (40, 0.0), cntB (40, 0.0);
    int nSp = 0, nCut = 0;
    std::vector<int> edges;
    for (double f = 90; f < 20000; f *= std::pow (2.0, 1.0 / 3.0))
        edges.push_back ((int) std::lround (f * N / kFs));
    edges.push_back (kHi);
    for (int t = 0; t < T.frames; ++t)
    {
        // état de la trame d'après la voix sèche
        const int c = t * H + N / 2;
        bool speech = true, gap = true;
        for (int i = c - N / 2; i < c + N / 2; ++i)
        {
            speech &= v.active[(size_t) i] != 0;
            gap &= v.active[(size_t) i] == 0;
        }
        // pause : au moins 40 ms après la fin de la syllabe (réverbe tardive seulement)
        if (gap)
        {
            bool late = true;
            for (int i = c - N / 2 - (int) (0.04 * kFs); i < c - N / 2; ++i)
                late &= i >= 0 && v.active[(size_t) i] == 0;
            if (! late)
                gap = false;
        }
        const float* pt = &T.pw[(size_t) t * 513];
        const float* pi = &I.pw[(size_t) t * 513];
        const float* po = &O.pw[(size_t) t * 513];
        if (gap)
        {
            for (int k = kLo; k < kHi; ++k)
            {
                eTailIn += pi[k];
                eTailOut += po[k];
            }
            for (int k : modeBins)
            {
                eModIn += pi[k];
                eModOut += po[k];
            }
        }
        if (speech)
        {
            // distance log-spectrale sur bandes où la cible est audible
            double maxT = 0;
            for (int k = kLo; k < kHi; ++k)
                maxT = std::max (maxT, (double) pt[k]);
            double di = 0, d_o = 0;
            int cnt = 0;
            for (int k = kLo; k < kHi; ++k)
            {
                eSpT += pt[k];
                eSpO += po[k];
                if (pt[k] < maxT * 1e-4)
                    continue;
                const double a = 10 * std::log10 (pt[k]);
                di += std::pow (10 * std::log10 (pi[k]) - a, 2);
                d_o += std::pow (10 * std::log10 (po[k]) - a, 2);
                ++cnt;
            }
            if (cnt > 0)
            {
                lsdI += std::sqrt (di / cnt);
                lsdO += std::sqrt (d_o / cnt);
                ++nSp;
            }
            double bi = 0, bo = 0;
            int nb = 0;
            for (size_t e = 0; e + 1 < edges.size(); ++e)
            {
                double st = 0, si = 0, so = 0;
                for (int k = edges[e]; k < std::max (edges[e] + 1, edges[e + 1]); ++k)
                {
                    st += pt[k];
                    si += pi[k];
                    so += po[k];
                }
                if (st < maxT * 1e-4)
                    continue;
                bi += std::pow (10 * std::log10 (si / st), 2);
                bo += std::pow (10 * std::log10 (so / st), 2);
                sumBi[e] += 10 * std::log10 (si / st);
                sumBo[e] += 10 * std::log10 (so / st);
                cntB[e] += 1;
                ++nb;
            }
            if (nb > 0)
            {
                bI += std::sqrt (bi / nb);
                bO += std::sqrt (bo / nb);
            }
            for (int k = kLo; k < kHi; ++k)
                if (pt[k] > maxT * 0.01) // à moins de 20 dB du maximum de la trame
                {
                    cut += std::min (0.0, 10.0 * std::log10 ((double) po[k] / pt[k]));
                    ++nCut;
                }
        }
    }
    Metrics m;
    m.tailWide = 10 * std::log10 (eTailOut / eTailIn);
    m.tailModes = modeBins.empty() ? 0.0 : 10 * std::log10 (eModOut / eModIn);
    m.speechLevel = 10 * std::log10 (eSpO / eSpT);
    m.lsdIn = lsdI / std::max (1, nSp);
    m.lsdOut = lsdO / std::max (1, nSp);
    m.bandIn = bI / std::max (1, nSp);
    m.bandOut = bO / std::max (1, nSp);
    m.cutStrong = cut / std::max (1, nCut);
    for (size_t e = 0; e + 1 < edges.size(); ++e)
        if (cntB[e] > 0)
        {
            m.bandHz.push_back (edges[e] * kFs / N);
            m.bandBiasIn.push_back (sumBi[e] / cntB[e]);
            m.bandBiasOut.push_back (sumBo[e] / cntB[e]);
        }
    return m;
}

// Capture façon NT-USB : souffle / bruit de pièce à -78 dBFS RMS puis quantification 16 bits.
std::vector<float> ntUsbCapture (const std::vector<float>& x, unsigned seed)
{
    std::mt19937 rng (seed);
    std::normal_distribution<double> gauss (0.0, 1.0);
    std::vector<float> y (x.size());
    const double nrms = std::pow (10.0, -78.0 / 20.0);
    double pink = 0.0;
    for (size_t i = 0; i < x.size(); ++i)
    {
        pink += 0.05 * (gauss (rng) - pink); // bruit de pièce plutôt grave
        const double v = x[i] + nrms * (0.7 * gauss (rng) + 2.5 * pink);
        y[i] = (float) (std::round (v * 32767.0) / 32767.0);
    }
    return y;
}

// Énergie dans les pauses (hors réverbe : > 400 ms après la parole), en dB.
double gapNoiseDb (const Voice& v, const std::vector<float>& x)
{
    double e = 0;
    size_t n = 0, quiet = 0;
    for (size_t i = 0; i < x.size() - 2048; ++i)
    {
        quiet = v.active[i] ? 0 : quiet + 1;
        if (quiet > (size_t) (0.4 * kFs) || (i < (size_t) (0.29 * kFs) && i > 4096))
        {
            e += (double) x[i] * x[i];
            ++n;
        }
    }
    return 10 * std::log10 (e / std::max<size_t> (n, 1) + 1e-30);
}

double nullDepth (const std::vector<float>& ref, const std::vector<float>& out)
{
    double e = 0, d = 0;
    for (size_t i = 0; i < ref.size() - 2048; ++i)
    {
        e += (double) ref[i] * ref[i];
        d += (double) (out[i] - ref[i]) * (out[i] - ref[i]);
    }
    return 10 * std::log10 (e / std::max (d, 1e-30));
}

// Rapport réverbe tardive / (direct + premières réflexions) réel, par bin de la STFT 1024.
void printProfile (const std::vector<float>& ir, const Learned& L)
{
    const int keep = (int) (0.025 * kFs);
    std::vector<float> e (ir.begin(), ir.begin() + keep), l (ir.size(), 0.0f);
    for (size_t i = (size_t) keep; i < ir.size(); ++i)
        l[i] = ir[i];
    int N = 1 << 18;
    RealFFT f;
    f.prepare (N);
    std::vector<float> a ((size_t) N, 0.0f), b ((size_t) N, 0.0f);
    std::copy (e.begin(), e.end(), a.begin());
    std::copy (l.begin(), l.end(), b.begin());
    std::vector<Cpx> A ((size_t) N / 2 + 1), B ((size_t) N / 2 + 1);
    f.forward (a.data(), A.data());
    f.forward (b.data(), B.data());
    std::printf ("     f(Hz)   q réel  q appris  RT appris\n");
    for (double hz : { 98.0, 115.0, 147.0, 172.0, 245.0, 300.0, 390.0, 600.0, 1000.0, 2000.0, 4000.0, 8000.0 })
    {
        const int k = (int) std::lround (hz * 1024 / kFs);
        const double c = k * kFs / 1024, w = kFs / 1024;
        double ee = 0, el = 0;
        for (int j = (int) ((c - w) * N / kFs); j <= (int) ((c + w) * N / kFs); ++j)
        {
            ee += norm2 (A[(size_t) j]);
            el += norm2 (B[(size_t) j]);
        }
        std::printf ("   %7.0f  %+6.1f    %+6.1f     %.2f s\n", hz, 10 * std::log10 (el / ee), L.qDb[(size_t) k], std::exp (L.rt[(size_t) k]));
    }
}

// Réglages d'essai : finition radio coupée pour juger le dé-réverbérateur seul.
DeRoomParams base()
{
    DeRoomParams p;
    p.finish = 0.0f;
    return p;
}

int failures = 0;
void check (bool ok, const char* what)
{
    std::printf ("  [%s] %s\n", ok ? "OK" : "ÉCHEC", what);
    if (! ok)
        ++failures;
}
} // namespace

int main()
{
    const Voice voice = makeVoice (14.0, 7);

    // 1. Reconstruction parfaite et latence exacte (réduction à 0).
    {
        DeRoomParams p = base();
        p.reduction = 0.0f;
        auto out = runEngine (voice.x, p, 1);
        const double nd = nullDepth (voice.x, out);
        std::printf ("Reconstruction (réduction 0) : null %.1f dB\n", nd);
        check (nd > 90.0, "latence annoncée exacte et reconstruction parfaite");
    }

    // 2. Voix sèche : le traitement doit rester transparent.
    {
        DeRoomParams p = base();
        auto out = runEngine (voice.x, p, 2);
        const Metrics m = measure (voice, voice.x, voice.x, out, {});
        std::printf ("Voix sèche, réglages par défaut : niveau parole %+.2f dB, voix forte %+.2f dB, bandes %.2f dB, LSD %.2f dB, null %.1f dB\n",
                     m.speechLevel, m.cutStrong, m.bandOut, m.lsdOut, nullDepth (voice.x, out));
        check (m.speechLevel > -0.5, "voix sèche : pas de perte de niveau pendant la parole");
        check (m.lsdOut < 1.0, "voix sèche : timbre préservé (LSD < 1 dB)");
    }

    // 2b. NT-USB sec (bruit 16 bits) : le souffle de fond ne doit pas « pomper ».
    {
        const auto cap = ntUsbCapture (voice.x, 3);
        DeRoomParams p = base();
        auto out = runEngine (cap, p, 2);
        const Metrics m = measure (voice, cap, cap, out, {});
        const double dn = gapNoiseDb (voice, out) - gapNoiseDb (voice, cap);
        std::printf ("NT-USB sec + bruit 16 bits : niveau parole %+.2f dB, bandes %.2f dB, bruit de fond %+.2f dB\n",
                     m.speechLevel, m.bandOut, dn);
        check (std::abs (dn) < 1.5, "NT-USB : bruit de fond conservé (pas de gate / pompage)");
        check (m.bandOut < 1.0, "NT-USB : voix sèche intacte");
    }

    // 3. Pièces réverbérantes.
    const Room rooms[] = {
        { "NT-USB sur bureau, petite pièce non traitée (modes 110/165/220/330 Hz)", 0.40, 6.0, { 110, 165, 220, 330 }, { 0.8, 0.7, 0.65, 0.55 }, 0.5 },
        { "Cabine boîte (modes 115/172/245/390 Hz)", 0.30, 2.0, { 115, 172, 245, 390 }, { 0.9, 0.8, 0.7, 0.6 }, 0.55 },
        { "Chambre (RT 0,5 s, modes graves)", 0.50, 0.0, { 98, 147, 196 }, { 1.1, 1.0, 0.8 }, 0.35 },
        { "Salon réverbérant (RT 0,8 s)", 0.80, -3.0, { 86, 129 }, { 1.4, 1.2 }, 0.2 },
    };

    unsigned seed = 11;
    for (const Room& room : rooms)
    {
        std::vector<float> ir, irEarly;
        makeIR (room, seed++, ir, irEarly);
        const bool usb = room.name.rfind ("NT-USB", 0) == 0;
        auto wet = convolve (voice.x, ir);
        auto target = convolve (voice.x, irEarly);
        if (usb)
        {
            wet = ntUsbCapture (wet, 5);
            target = ntUsbCapture (target, 5);
        }

        std::printf ("\n%s\n", room.name.c_str());
        const Metrics m0 = measure (voice, target, wet, wet, room.modeHz);
        std::printf ("  entrée            : LSD %.2f dB\n", m0.lsdIn);

        for (float red : { 0.5f, 0.7f, 1.0f })
        {
            DeRoomParams p = base();
            p.reduction = red;
            double ms = 0;
            Learned L;
            const auto out = runEngine (wet, p, getenv ("PASSES") ? atoi (getenv ("PASSES")) : 2, &ms, &L);
            const Metrics m = measure (voice, target, wet, out, room.modeHz);
            std::printf ("  réduction %3.0f %%  : queue %+.1f dB, modes %+.1f dB, parole %+.2f dB, voix forte %+.2f dB (entrée %+.2f), "
                         "bandes %.2f -> %.2f dB, LSD %.2f -> %.2f  (%.1f ms CPU/s)\n",
                         red * 100, m.tailWide, m.tailModes, m.speechLevel, m.cutStrong, m0.cutStrong, m.bandIn, m.bandOut, m.lsdIn, m.lsdOut, ms);
            if (red == 0.7f)
            {
                printProfile (ir, L);
                std::printf ("     écart parole/cible par bande (entrée -> sortie) :");
                for (size_t b = 0; b < m.bandHz.size(); b += 3)
                    std::printf (" %.0fHz %+.1f->%+.1f", m.bandHz[b], m.bandBiasIn[b], m.bandBiasOut[b]);
                std::printf ("\n");
                double boomIn = 0, boomOut = 0, worst = 0;
                int nb = 0;
                for (size_t b = 0; b < m.bandHz.size(); ++b)
                {
                    if (m.bandHz[b] < 400.0)
                    {
                        boomIn += m.bandBiasIn[b];
                        boomOut += m.bandBiasOut[b];
                        ++nb;
                    }
                    worst = std::min (worst, m.bandBiasOut[b]);
                }
                boomIn /= std::max (1, nb);
                boomOut /= std::max (1, nb);
                std::printf ("     bosse de pièce < 400 Hz pendant la parole : %+.1f -> %+.1f dB ; bande la plus creusée %+.1f dB\n",
                             boomIn, boomOut, worst);
                check (m.tailWide < -6.0, "réverbe tardive réduite d'au moins 6 dB dans les pauses");
                check (m.tailModes < -6.0, "résonances de la pièce réduites d'au moins 6 dB dans les pauses");
                check (boomIn - boomOut > 2.0, "bosse des modes (< 400 Hz) réduite d'au moins 2 dB pendant la parole");
                check (worst > -2.0, "aucune bande de la voix creusée de plus de 2 dB");
                check (m.bandOut < m.bandIn + 0.5, "équilibre spectral de la parole non dégradé");
                check (ms < 25.0, "léger : < 2,5 % d'un cœur en stéréo 48 kHz (valeur réelle affichée)");
            }
        }
    }

    // 4. Musique sur les enceintes, branchée en sidechain : elle ne doit pas finir dans la prise.
    //    a) 0–8 s musique seule, 8–16 s voix + musique, 16–24 s musique seule ;
    //    b) on parle dès que la musique démarre (0–16 s), puis musique seule.
    for (const bool talkFromStart : { false, true })
    {
        std::printf ("\nMusique sur les enceintes (sidechain), voix NT-USB sur bureau%s\n",
                     talkFromStart ? " — on parle dès le départ" : "");
        Voice v = makeVoice (24.0, 21);
        for (size_t i = 0; i < v.x.size(); ++i)
            if ((! talkFromStart && i < (size_t) (8.0 * kFs)) || i >= (size_t) (16.0 * kFs))
            {
                v.x[i] = 0.0f;
                v.active[i] = 0;
            }
        std::vector<float> mL, mR;
        makeMusic (24.0, 5, mL, mR);
        const Room room { "NT-USB", 0.40, 6.0, { 110, 165, 220, 330 }, { 0.8, 0.7, 0.65, 0.55 }, 0.5 };
        std::vector<float> ir, irEarly;
        makeIR (room, 31, ir, irEarly);
        const auto voiceWet = convolve (v.x, ir);
        const auto target = ntUsbCapture (convolve (v.x, irEarly), 9);
        const auto eL = convolve (mL, speakerPath (38.0, -14.0, 0.35, 1));
        const auto eR = convolve (mR, speakerPath (41.0, -15.0, 0.35, 2));
        std::vector<float> mic (v.x.size());
        for (size_t i = 0; i < mic.size(); ++i)
            mic[i] = voiceWet[i] + eL[i] + eR[i];
        mic = ntUsbCapture (mic, 9);
        const auto voiceOnly = ntUsbCapture (voiceWet, 9);

        DeRoomParams p = base();
        double ms = 0;
        float erle = 0;
        const auto out = runEngine (mic, p, 1, &ms, nullptr, &mL, &mR, &erle);
        const auto outVoiceOnly = runEngine (voiceOnly, p, 1);

        auto energyDb = [&] (const std::vector<float>& x, double t0, double t1) {
            double e = 0;
            for (size_t i = (size_t) (t0 * kFs); i < (size_t) (t1 * kFs); ++i)
                e += (double) x[i] * x[i];
            return 10 * std::log10 (e + 1e-20);
        };
        const double before = talkFromStart ? -99.0 : energyDb (out, 4.0, 8.0) - energyDb (mic, 4.0, 8.0);
        const double after = energyDb (out, 17.5, 24.0) - energyDb (mic, 17.5, 24.0);
        // En parlant dès le départ, on juge la voix une fois le filtre accroché (après 5 s).
        Voice judged = v;
        if (talkFromStart)
            std::fill (judged.active.begin(), judged.active.begin() + (long) (5.0 * kFs), 0);
        const Metrics withMusic = measure (judged, target, mic, out, {});
        const Metrics without = measure (judged, target, voiceOnly, outVoiceOnly, {});
        if (! talkFromStart)
            std::printf ("  musique seule, avant la voix : %+.1f dB\n", before);
        std::printf ("  musique seule, après la voix : %+.1f dB (le filtre a survécu à la double parole)\n", after);
        std::printf ("  parole avec musique          : niveau %+.2f dB, bandes %.2f dB (sans musique : %+.2f dB, %.2f dB)\n",
                     withMusic.speechLevel, withMusic.bandOut, without.speechLevel, without.bandOut);
        std::printf ("  CPU                          : %.1f ms / s audio\n", ms);
        check (before < -20.0, "musique seule retirée d'au moins 20 dB");
        check (after < -18.0, "toujours au moins 18 dB après avoir parlé par-dessus (filtre non déréglé)");
        // La voix est jugée sous une musique forte (écho à peine 10 dB sous la voix) : il en reste
        // un peu, et la suppression du résidu entame la voix là où la musique domine.
        // En parlant dès le départ, le filtre accroche pendant la double parole : un peu plus de musique reste.
        check (withMusic.bandOut < without.bandOut + (talkFromStart ? 4.0 : 3.5),
               talkFromStart ? "voix sous la musique (filtre appris en parlant) : équilibre spectral à moins de 4 dB"
                             : "voix sous la musique : équilibre spectral à moins de 3,5 dB de la prise sans musique");
        check (std::abs (withMusic.speechLevel - without.speechLevel) < 1.5, "niveau de la voix préservé malgré la musique");
        check (ms < 50.0, "léger : < 5 % d'un cœur avec la musique en stéréo (valeur réelle affichée)");
    }

    // 5. Mode faible latence (temps réel).
    {
        std::printf ("\nMode faible latence\n");
        gLowLatency = true;
        DeRoomParams p = base();
        p.reduction = 0.0f;
        const auto rec = runEngine (voice.x, p, 1);
        DeRoomEngine probe;
        probe.prepare (kFs, 2, true);
        std::printf ("  latence %d échantillons (%.1f ms), reconstruction null %.1f dB\n", probe.getLatencySamples(),
                     probe.getLatencySamples() * 1000.0 / kFs, nullDepth (voice.x, rec));
        check (probe.getLatencySamples() <= 512 && nullDepth (voice.x, rec) > 90.0, "faible latence : ~11 ms, reconstruction parfaite");

        std::vector<float> ir, irEarly;
        makeIR (rooms[0], 11, ir, irEarly);
        const auto wet = ntUsbCapture (convolve (voice.x, ir), 5);
        const auto target = ntUsbCapture (convolve (voice.x, irEarly), 5);
        p = base();
        double ms = 0;
        const auto out = runEngine (wet, p, 2, &ms);
        const Metrics m = measure (voice, target, wet, out, rooms[0].modeHz);
        std::printf ("  NT-USB sur bureau : queue %+.1f dB, modes %+.1f dB, bandes %.2f -> %.2f dB (%.1f ms CPU/s)\n",
                     m.tailWide, m.tailModes, m.bandIn, m.bandOut, ms);
        check (m.tailWide < -6.0 && m.tailModes < -6.0, "faible latence : réverbe et modes réduits d'au moins 6 dB");
        check (m.bandOut < m.bandIn + 0.5, "faible latence : équilibre spectral de la parole non dégradé");
        gLowLatency = false;
    }

    // 6. Finition studio / radio sur la voix NT-USB nettoyée.
    {
        std::printf ("\nFinition studio / radio (60 %%)\n");
        auto quiet = voice.x;
        for (float& v : quiet)
            v *= 0.3f; // prise un peu basse, fréquente sans réglage de gain sur le micro
        const auto cap = ntUsbCapture (quiet, 13);
        DeRoomParams p = base();
        p.finish = 0.6f;
        const auto out = runEngine (cap, p, 1);

        auto rmsSpeech = [&] (const std::vector<float>& x, bool fric) {
            double e = 0;
            size_t n = 0;
            for (size_t i = 0; i < x.size(); ++i)
                if (voice.active[i])
                {
                    e += (double) x[i] * x[i];
                    ++n;
                }
            (void) fric;
            return 10 * std::log10 (e / std::max<size_t> (n, 1) + 1e-20);
        };
        float peak = 0.0f;
        for (float v : out)
            peak = std::max (peak, std::abs (v));
        // Énergie au-dessus de 5 kHz rapportée au total, pendant la parole (sifflantes).
        auto hfShare = [&] (const std::vector<float>& x) {
            const Spectro S = spectro (x);
            double hi = 0, all = 0;
            for (int t = 0; t < S.frames; ++t)
                for (int k = 2; k < 470; ++k)
                {
                    const double v = S.pw[(size_t) t * 513 + (size_t) k];
                    all += v;
                    if (k > 107)
                        hi += v;
                }
            return 10 * std::log10 (hi / all);
        };
        const double lvlIn = rmsSpeech (cap, false), lvlOut = rmsSpeech (out, false);
        std::printf ("  niveau parole %.1f -> %.1f dBFS RMS, crête %.1f dBFS, part > 5 kHz %.1f -> %.1f dB\n", lvlIn, lvlOut,
                     20 * std::log10 (peak), hfShare (cap), hfShare (out));
        check (lvlOut > -24.0 && lvlOut < -12.0, "voix ramenée à un niveau radio (-24..-12 dBFS RMS)");
        check (peak < 0.9f, "crêtes sous -0,9 dBFS (limiteur)");
        check (hfShare (out) < hfShare (cap) + 4.0, "aigus contenus : pas de voix agressive");
    }

    std::printf ("\n%s (%d échec(s))\n", failures ? "ÉCHEC" : "TOUT EST OK", failures);
    return failures ? 1 : 0;
}
