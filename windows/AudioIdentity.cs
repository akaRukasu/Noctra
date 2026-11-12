using System;
using System.IO;
using System.Threading.Tasks;
using NAudio.CoreAudioApi;

namespace Noctra.Windows;

internal static class AudioIdentity
{
    private static readonly Guid Group=new("39E9706F-6164-4249-B4DD-D53CF751D8B1");
    private static readonly Guid Context=new("627FBF91-9D94-431C-BBA7-7D60100BAB61");
    internal static Task Refresh() => Task.Run(()=>
    {
        try
        {
            using var enumerator=new MMDeviceEnumerator();
            foreach(var device in enumerator.EnumerateAudioEndPoints(DataFlow.Render,DeviceState.Active))
            using(device)
            {
                var sessions=device.AudioSessionManager.Sessions;
                for(var index=0;index<sessions.Count;index++)
                using(var session=sessions[index])
                {
                    if(session.GetProcessID!=Environment.ProcessId)continue;
                    session.DisplayName="Noctra";
                    session.IconPath=Path.Combine(AppContext.BaseDirectory,"Noctra.exe")+",0";
                    session.SetGroupingParam(Group,Context);
                }
            }
        }
        catch(Exception error) when(error is System.Runtime.InteropServices.COMException or InvalidOperationException) { }
    });
}
