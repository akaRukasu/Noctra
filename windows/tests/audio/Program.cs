using NAudio.CoreAudioApi;
using NAudio.Wave;
using System.Text.Json;

if (args is ["--capture", var processId, var milliseconds, var path])
{
    if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 19041)) throw new PlatformNotSupportedException();
    var format = new WaveFormat(48000, 16, 2);
    await using var recorder = await new WasapiRecorderBuilder()
        .WithProcessLoopback(uint.Parse(processId), ProcessLoopbackMode.IncludeTargetProcessTree)
        .WithFormat(format).BuildAsync();
    using var file = new WaveFileWriter(path, format);
    recorder.DataAvailable += (buffer, _, _, _) => file.Write(buffer);
    var stopped = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    recorder.RecordingStopped += (_, _) => stopped.TrySetResult();
    recorder.StartRecording();
    await Task.Delay(int.Parse(milliseconds));
    recorder.StopRecording();
    await stopped.Task.WaitAsync(TimeSpan.FromSeconds(5));
    return;
}

if (args.Length == 0) throw new ArgumentException("Supply the process IDs of the test Noctra instance and its web player.");
var processes = args.Select(uint.Parse).ToHashSet();
using var enumerator=new MMDeviceEnumerator();
var result=new List<object>();
foreach(var device in enumerator.EnumerateAudioEndPoints(DataFlow.Render,DeviceState.Active))
using(device)
{
    var sessions=device.AudioSessionManager.Sessions;
    for(var index=0;index<sessions.Count;index++)
    using(var session=sessions[index])
    {
        var process = session.GetProcessID;
        if (!processes.Contains(process)) continue;
        float peak=0;
        for(var sample=0;sample<12;sample++){peak=Math.Max(peak,session.AudioMeterInformation.MasterPeakValue);Thread.Sleep(25);}
        result.Add(new {process,name=session.DisplayName,peak,muted=session.SimpleAudioVolume.Mute});
    }
}
Console.WriteLine(JsonSerializer.Serialize(result));
