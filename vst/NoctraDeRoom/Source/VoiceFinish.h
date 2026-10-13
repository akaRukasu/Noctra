// Noctra DeRoom — finition « studio / radio » de la voix, sans latence ajoutée.
//
// Chaîne : coupe-bas anti-grondement → égalisation voix (chaleur, désencombrement du bas-médium,
// air) → de-esser → nivellement lent (AGC) → compresseur → expandeur doux entre les phrases →
// limiteur à -1 dBFS. Un seul réglage, « amount » (0 = chaîne contournée, 1 = voix radio).
// Détection liée sur tous les canaux : l'image stéréo ne bouge pas.

#pragma once

#include <algorithm>
#include <cmath>
#include <vector>

namespace noctra
{

struct Biquad
{
    float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;

    // Filtres du « RBJ Audio EQ Cookbook ».
    static Biquad make (int type, double fs, double f0, double q, double gainDb)
    {
        const double pi = 3.14159265358979323846;
        const double A = std::pow (10.0, gainDb / 40.0);
        const double w = 2.0 * pi * std::min (f0, 0.49 * fs) / fs;
        const double cw = std::cos (w), sw = std::sin (w);
        const double alpha = sw / (2.0 * q);
        double b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
        switch (type)
        {
            case highpass:
                b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2;
                a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
                break;
            case bandpass:
                b0 = alpha; b1 = 0; b2 = -alpha;
                a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
                break;
            case peak:
                b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A;
                a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
                break;
            case lowShelf:
            {
                const double s = 2 * std::sqrt (A) * alpha;
                b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
                a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s;
                break;
            }
            case highShelf:
            {
                const double s = 2 * std::sqrt (A) * alpha;
                b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
                a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s;
                break;
            }
            default: break;
        }
        Biquad b;
        b.b0 = (float) (b0 / a0); b.b1 = (float) (b1 / a0); b.b2 = (float) (b2 / a0);
        b.a1 = (float) (a1 / a0); b.a2 = (float) (a2 / a0);
        return b;
    }

    enum { highpass, bandpass, peak, lowShelf, highShelf };
};

/** État d'un biquad (forme directe transposée II). */
struct BiquadState
{
    float z1 = 0, z2 = 0;

    inline float tick (const Biquad& c, float x)
    {
        const float y = c.b0 * x + z1;
        z1 = c.b1 * x - c.a1 * y + z2;
        z2 = c.b2 * x - c.a2 * y;
        return y;
    }
};

class VoiceFinisher
{
public:
    void prepare (double sampleRate, int maxChannels)
    {
        fs = sampleRate;
        numCh = std::max (1, maxChannels);
        state.assign ((size_t) numCh, ChannelState {});
        currentAmount = -1.0f;
        attackFast = coef (0.004);
        releaseFast = coef (0.12);
        attackSlow = coef (0.4);
        releaseSlow = coef (1.5);
        deessAttack = coef (0.001);
        deessRelease = coef (0.06);
        expAttack = coef (0.005);
        expRelease = coef (0.25);
        reset();
    }

    void reset()
    {
        for (auto& s : state)
            s = ChannelState {};
        envFast = envSlow = envSib = envFull = 1.0e-6f;
        agcGainDb = 0.0f;
        expGain = 1.0f;
        gainCur = gainTarget = 1.0f;
        sibCur = sibTarget = 1.0f;
        ctrl = 0;
    }

    /** amount : 0 = contourné, 1 = voix radio. */
    void process (float* const* ch, int nc, int n, float amount)
    {
        amount = std::clamp (amount, 0.0f, 1.0f);
        if (amount <= 0.001f)
            return;
        if (std::abs (amount - currentAmount) > 0.005f)
            design (amount);
        nc = std::min (nc, numCh);

        for (int i = 0; i < n; ++i)
        {
            // 1. Filtres fixes : coupe-bas, chaleur, désencombrement, air.
            float mono = 0.0f, sib = 0.0f;
            for (int c = 0; c < nc; ++c)
            {
                auto& s = state[(size_t) c];
                float x = ch[c][i];
                x = s.hp1.tick (hp, x);
                x = s.hp2.tick (hp, x);
                x = s.warm.tick (warm, x);
                x = s.box.tick (box, x);
                x = s.air.tick (air, x);
                ch[c][i] = x;
                mono += x;
                sib += s.sibBand.tick (sibBand, x);
            }
            mono /= (float) nc;
            sib /= (float) nc;

            // 2. Enveloppes (par échantillon, peu coûteuses).
            const float sib2 = sib * sib, full2 = mono * mono;
            envSib += (sib2 > envSib ? deessAttack : deessRelease) * (sib2 - envSib);
            envFull += (full2 > envFull ? deessAttack : deessRelease) * (full2 - envFull);
            envFast += (full2 > envFast ? attackFast : releaseFast) * (full2 - envFast);

            // 3. Calcul des gains toutes les 16 échantillons (~3 ms), lissé ensuite.
            if (++ctrl >= 16)
            {
                ctrl = 0;
                const float fastDb = 10.0f * std::log10 (envFast + 1.0e-12f);
                const float slowDb = 10.0f * std::log10 (envSlow + 1.0e-12f);
                const bool speaking = fastDb > std::max (-65.0f, slowDb - 24.0f);

                // AGC lent : ramène la voix vers la cible, seulement quand on parle.
                if (speaking)
                {
                    envSlow += (envFast > envSlow ? 16.0f * attackSlow : 16.0f * releaseSlow) * (envFast - envSlow);
                    const float want = std::clamp (agcTargetDb - slowDb, -agcRangeDb, agcRangeDb);
                    agcGainDb += 0.008f * (want - agcGainDb);
                }

                // Compresseur à genou doux sur le niveau après AGC.
                const float over = fastDb + agcGainDb - compThreshDb;
                float grDb = 0.0f;
                if (over > kneeDb * 0.5f)
                    grDb = over * (1.0f - 1.0f / compRatio);
                else if (over > -kneeDb * 0.5f)
                {
                    const float t = over + kneeDb * 0.5f;
                    grDb = (1.0f - 1.0f / compRatio) * t * t / (2.0f * kneeDb);
                }

                // Expandeur doux entre les phrases : le bruit de pièce ne remonte pas avec la compression.
                const float expTarget = speaking ? 1.0f : expRangeLin;
                expGain += (expTarget > expGain ? 16.0f * expAttack : 16.0f * expRelease) * (expTarget - expGain);
                expGain = std::clamp (expGain, expRangeLin, 1.0f);

                gainTarget = std::pow (10.0f, (agcGainDb - grDb + makeupDb) / 20.0f) * expGain;

                // De-esser : sifflantes (5–9 kHz) trop fortes devant le reste → aigus abaissés.
                const float ratioDb = 10.0f * std::log10 ((envSib + 1.0e-12f) / (envFull + 1.0e-12f));
                const float overDb = std::max (0.0f, ratioDb - deessThreshDb);
                sibTarget = std::pow (10.0f, -std::min (overDb * 0.7f, deessMaxDb) / 20.0f);
            }
            gainCur += 0.08f * (gainTarget - gainCur);
            sibCur += 0.25f * (sibTarget - sibCur);

            for (int c = 0; c < nc; ++c)
            {
                auto& s = state[(size_t) c];
                float x = ch[c][i];
                const float hi = s.deessHp.tick (deessHp, x);
                x -= (1.0f - sibCur) * hi;
                ch[c][i] = softLimit (x * gainCur);
            }
        }
    }

    /** Gain appliqué par le nivellement + compresseur (dB), pour l'affichage. */
    float getGainDb() const { return 20.0f * std::log10 (gainCur + 1.0e-9f); }

private:
    struct ChannelState
    {
        BiquadState hp1, hp2, warm, box, air, sibBand, deessHp;
    };

    float coef (double seconds) const { return 1.0f - (float) std::exp (-1.0 / (seconds * fs)); }

    void design (float a)
    {
        currentAmount = a;
        hp = Biquad::make (Biquad::highpass, fs, 60.0 + 30.0 * a, 0.707, 0.0);   // 4e ordre au total
        warm = Biquad::make (Biquad::lowShelf, fs, 140.0, 0.7, 2.0 * a);           // corps « radio »
        box = Biquad::make (Biquad::peak, fs, 320.0, 1.1, -2.5 * a);               // son « carton » en moins
        air = Biquad::make (Biquad::highShelf, fs, 10000.0, 0.7, 3.0 * a);         // air
        sibBand = Biquad::make (Biquad::bandpass, fs, 6800.0, 1.2, 0.0);
        deessHp = Biquad::make (Biquad::highpass, fs, 4500.0, 0.707, 0.0);

        compRatio = 1.5f + 2.5f * a;          // jusqu'à 4:1
        compThreshDb = -12.0f - 6.0f * a;
        kneeDb = 8.0f;
        agcTargetDb = -15.0f;               // enveloppe crête : environ -19 dBFS RMS de parole
        agcRangeDb = 6.0f + 14.0f * a;     // le NT-USB d'origine n'a pas de réglage de gain : prises souvent basses
        expRangeLin = std::pow (10.0f, -8.0f * a / 20.0f);
        deessThreshDb = -14.0f + 4.0f * (1.0f - a);
        deessMaxDb = 3.0f + 6.0f * a;
        // Rattrapage : niveau de la voix comprimée ramené vers -16 dBFS RMS environ.
        makeupDb = 4.0f * a;
    }

    static float softLimit (float x)
    {
        // Limiteur instantané à genou doux : linéaire jusqu'à -3 dBFS, plafond à -1 dBFS.
        constexpr float t = 0.708f, ceiling = 0.891f;
        const float ax = std::abs (x);
        if (ax <= t)
            return x;
        const float y = t + (ceiling - t) * std::tanh ((ax - t) / (ceiling - t));
        return x < 0.0f ? -y : y;
    }

    double fs = 48000.0;
    int numCh = 2;
    float currentAmount = -1.0f;
    Biquad hp, warm, box, air, sibBand, deessHp;
    std::vector<ChannelState> state;

    float attackFast = 0, releaseFast = 0, attackSlow = 0, releaseSlow = 0;
    float deessAttack = 0, deessRelease = 0, expAttack = 0, expRelease = 0;
    float envFast = 1e-6f, envSlow = 1e-6f, envSib = 1e-6f, envFull = 1e-6f;
    float agcGainDb = 0.0f, expGain = 1.0f, gainCur = 1.0f, gainTarget = 1.0f, sibCur = 1.0f, sibTarget = 1.0f;
    int ctrl = 0;
    float compRatio = 2.0f, compThreshDb = -18.0f, kneeDb = 8.0f, agcTargetDb = -20.0f, agcRangeDb = 6.0f;
    float expRangeLin = 0.5f, deessThreshDb = -12.0f, deessMaxDb = 6.0f, makeupDb = 0.0f;
};

} // namespace noctra
