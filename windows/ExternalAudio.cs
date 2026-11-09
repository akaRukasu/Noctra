using System;
using System.Buffers.Binary;
using System.Diagnostics;
using System.Text.Json;
using NAudio.Wave;

namespace Noctra.Windows;

internal sealed class ExternalAudio : IDisposable
{
    private WaveOut? output;
    private ExternalAudioBuffer? buffer;
    private string? source;
    private double area;
    private long packetsAt = Stopwatch.GetTimestamp(), lastPacket;
    private int packets;
    internal bool HasSignal { get; private set; }
    internal bool IsInitialized => output != null;
    internal string Nonce { get; } = Guid.NewGuid().ToString("N");

    internal bool Receive(JsonElement message, double volume)
    {
        if (message.Str("key") != Nonce) return false;
        var now=Stopwatch.GetTimestamp();
        if (Stopwatch.GetElapsedTime(packetsAt,now).TotalSeconds >= 1) { packetsAt=now; packets=0; }
        if (++packets > 120) return false;
        var id=message.Str("id"); var encoded=message.Str("pcm");
        var rate=(int)message.Num("rate"); var channels=(int)message.Num("channels");
        var incomingArea=message.Num("area");
        if (id.Length is < 1 or > 80 || encoded.Length is < 4 or > 24000 || rate is < 8000 or > 192000 || channels is < 1 or > 2 ||
            !double.IsFinite(incomingArea) || incomingArea < 0) return false;
        if (source != null && source != id && incomingArea <= area * 1.15 && Stopwatch.GetElapsedTime(lastPacket,now).TotalSeconds < 1) return false;
        byte[] bytes;
        try { bytes=Convert.FromBase64String(encoded); } catch (FormatException) { return false; }
        if (bytes.Length == 0 || bytes.Length % (2*channels) != 0) return false;
        if (buffer == null || buffer.WaveFormat.SampleRate != rate || buffer.WaveFormat.Channels != channels)
        {
            DisposeOutput();
            buffer = new ExternalAudioBuffer(new WaveFormat(rate, 16, channels));
            output = new WaveOut { BufferMilliseconds = 25, NumberOfBuffers = 3 };
            try { output.Init(buffer); output.Play(); }
            catch { DisposeOutput(); throw; }
        }
        if (source != id) buffer.Clear();
        source=id; area=incomingArea; lastPacket=now;
        var gain=Math.Clamp(volume,0,1);
        for (var index=0;index<bytes.Length;index+=2)
        {
            var value=BinaryPrimitives.ReadInt16LittleEndian(bytes.AsSpan(index));
            if (Math.Abs((int)value)>2) HasSignal=true;
            BinaryPrimitives.WriteInt16LittleEndian(bytes.AsSpan(index),(short)(value*gain));
        }
        buffer.Add(bytes);
        return true;
    }
    internal void Clear(string? id = null) { if (id == null || id == source) buffer?.Clear(); }
    private void DisposeOutput()
    {
        var old=output;output=null;buffer=null;source=null;
        if(old==null)return;
        try {old.Stop();}catch(NAudio.MmException){}
        old.Dispose();
    }
    public void Dispose() => DisposeOutput();

    internal string Script => """
    (()=>{
      const key=__KEY__, hooked=new WeakSet(), skipped=new WeakMap();
      const send=message=>{try{window.chrome?.webview?.postMessage({...message,key});}catch{}};
      const workletSource = `
        class NoctraAudioProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
            this.samples = new Int16Array(2048);
            this.position = 0;
          }
          process(inputs) {
            const [left, right = left] = inputs[0];
            if (!left) return true;
            for (let i = 0; i < left.length; i++) {
              this.samples[this.position++] = Math.round(Math.max(-1, Math.min(1, left[i])) * 32767);
              this.samples[this.position++] = Math.round(Math.max(-1, Math.min(1, right[i])) * 32767);
              if (this.position === this.samples.length) {
                this.port.postMessage(this.samples.buffer, [this.samples.buffer]);
                this.samples = new Int16Array(2048);
                this.position = 0;
              }
            }
            return true;
          }
        }
        registerProcessor('noctra-audio', NoctraAudioProcessor);
      `;

      async function audioProcessor(context, push) {
        if (context.audioWorklet) {
          const module = URL.createObjectURL(new Blob([workletSource], {type:'text/javascript'}));
          try {
            await context.audioWorklet.addModule(module);
            const node = new AudioWorkletNode(context, 'noctra-audio');
            node.port.onmessage = event => push(new Uint8Array(event.data));
            return node;
          } catch {
            // A site can restrict module URLs with its content security policy.
          } finally {
            URL.revokeObjectURL(module);
          }
        }
        const node = context.createScriptProcessor(2048, 2, 2);
        node.onaudioprocess = event => {
          const left = event.inputBuffer.getChannelData(0), right = event.inputBuffer.getChannelData(1);
          const pcm = new Uint8Array(left.length * 4), view = new DataView(pcm.buffer);
          for (let i = 0; i < left.length; i++) {
            view.setInt16(i * 4, Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), true);
            view.setInt16(i * 4 + 2, Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), true);
          }
          push(pcm);
        };
        return node;
      }

      async function wire(media){
        if(hooked.has(media)||media.tagName!=='VIDEO'||media.readyState<1||media.paused)return;
        const rect=media.getBoundingClientRect();
        if(rect.width<80||rect.height<45)return;
        const raw=media.currentSrc||media.src;
        if(!raw||skipped.get(media)===raw)return;
        try {
          const url=new URL(raw,location.href);
          if(media.mediaKeys||url.protocol!=='blob:'&&url.origin!==location.origin&&!media.crossOrigin){skipped.set(media,raw);send({type:'noctra-audio-unavailable'});return;}
        } catch {return;}
        hooked.add(media);
        let context;
        try{
          context=new AudioContext({latencyHint:'interactive',sampleRate:48000,sinkId:{type:'none'}});
          const id=crypto.randomUUID();
          let accepted=false, webFallback=false;
          const processor=await audioProcessor(context, pcm=>{
            if (!media.isConnected) { context.close().catch(()=>{}); return; }
            if (webFallback || media.paused || media.ended || media.muted || media.volume===0) return;
            const current=media.getBoundingClientRect();
            if(current.width<80||current.height<45)return;
            let data='';
            for(let i=0;i<pcm.length;i++)data+=String.fromCharCode(pcm[i]);
            send({type:'noctra-audio',id,rate:context.sampleRate,channels:2,area:current.width*current.height,pcm:btoa(data)});
          });
          const source=context.createMediaElementSource(media);
          const fallback=()=>{
            if(webFallback)return;
            webFallback=true;processor.disconnect();source.disconnect();source.connect(context.destination);
            context.setSinkId?.('').catch(()=>{});send({type:'noctra-audio-unavailable'});
          };
          window.chrome?.webview?.addEventListener('message',event=>{
            const data=event.data;if(data?.type==='noctra-audio-ack'&&data.key===key&&data.id===id){accepted=true;if(!data.native)fallback();}
          });
          const clear=()=>send({type:'noctra-audio-clear',id});
          let acknowledgementTimer;
          const resume=()=>{
            context.resume().catch(()=>{});
            if (accepted || webFallback || media.muted || media.volume===0) return;
            clearTimeout(acknowledgementTimer);
            acknowledgementTimer=setTimeout(()=>{
              if (!accepted && !media.paused && !media.muted && media.volume>0) fallback();
            },1800);
          };
          source.connect(processor);processor.connect(context.destination);
          media.addEventListener('play',resume);
          media.addEventListener('pause',clear);
          media.addEventListener('volumechange',()=>{if(media.muted||media.volume===0)clear();else resume();});
          resume();
        }catch{
          context?.close().catch(()=>{});
          hooked.delete(media);skipped.set(media,raw);send({type:'noctra-audio-unavailable'});
        }
      }
      setInterval(()=>{document.querySelectorAll('video').forEach(wire);},350);
      document.addEventListener('playing',event=>wire(event.target),true);
    })();
    """.Replace("__KEY__",JsonSerializer.Serialize(Nonce));
}
