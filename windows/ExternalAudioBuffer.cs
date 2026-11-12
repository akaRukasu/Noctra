using System;
using System.Buffers.Binary;
using NAudio.Wave;

namespace Noctra.Windows;

internal sealed class ExternalAudioBuffer(WaveFormat format) : IWaveProvider
{
    private readonly BufferedWaveProvider queue = new(format, TimeSpan.FromMilliseconds(600)) { ReadFully = false, DiscardOnBufferOverflow = true };
    private readonly object gate = new();
    private bool playing;
    private bool fadeIn;
    public WaveFormat WaveFormat => format;

    internal void Add(byte[] data)
    {
        lock (gate) queue.AddSamples(data, 0, data.Length);
    }

    internal void Clear()
    {
        lock (gate)
        {
            queue.ClearBuffer();
            playing = false;
        }
    }

    public int Read(byte[] destination, int offset, int count) => Read(destination.AsSpan(offset, count));

    public int Read(Span<byte> destination)
    {
        lock (gate)
        {
            if (!playing && queue.BufferedDuration >= TimeSpan.FromMilliseconds(140))
            {
                playing = true;
                fadeIn = true;
            }
            // Recover from sustained clock drift without throwing away the whole queue.
            if (queue.BufferedDuration > TimeSpan.FromMilliseconds(450))
            {
                var excess = queue.BufferedBytes - WaveFormat.ConvertLatencyToByteSize(200);
                while (excess > 0)
                {
                    var discarded = queue.Read(destination[..Math.Min(destination.Length, excess)]);
                    if (discarded == 0) break;
                    excess -= discarded;
                }
                fadeIn = true;
            }
            var read = playing ? queue.Read(destination) : 0;
            if (fadeIn && read > 0)
            {
                Fade(destination[..read], fadeOut: false);
                fadeIn = false;
            }
            if (read < destination.Length)
            {
                if (playing && read > 0) Fade(destination[..read], fadeOut: true);
                playing = false;
                destination[read..].Clear();
            }
            return destination.Length;
        }
    }

    private void Fade(Span<byte> samples, bool fadeOut)
    {
        var frames = samples.Length / format.BlockAlign;
        var length = Math.Min(frames, format.SampleRate / 200);
        var start = fadeOut ? frames - length : 0;
        for (var frame = 0; frame < length; frame++)
        {
            var gain = (fadeOut ? length - 1 - frame : frame) / (double)length;
            for (var channel = 0; channel < format.Channels; channel++)
            {
                var sample = samples.Slice((start + frame) * format.BlockAlign + channel * 2, 2);
                BinaryPrimitives.WriteInt16LittleEndian(sample, (short)(BinaryPrimitives.ReadInt16LittleEndian(sample) * gain));
            }
        }
    }
}
