using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Renci.SshNet;
using Renci.SshNet.Common;

namespace RecorderInstaller {
 public sealed class Target {
  public string Host, Local, Adapter; public int Port=22;
  public string Label { get { return Host+":"+Port; } }
 }
 public static class Enet {
  static readonly byte[] Ident={0,0,0,0,0,0x11};
  public static List<Target> Interfaces() {
   var list=new List<Target>();
   foreach(var nic in NetworkInterface.GetAllNetworkInterfaces()) {
    if(nic.OperationalStatus!=OperationalStatus.Up || nic.NetworkInterfaceType==NetworkInterfaceType.Loopback)continue;
    foreach(var u in nic.GetIPProperties().UnicastAddresses)if(u.Address.AddressFamily==AddressFamily.InterNetwork&&u.Address.ToString().StartsWith("169.254.",StringComparison.Ordinal))list.Add(new Target{Local=u.Address.ToString(),Adapter=nic.Name});
   } return list;
  }
  public static Target Discover(Action<string> log,CancellationToken cancel) {
   var adapters=Interfaces();if(adapters.Count==0)throw new InvalidOperationException("ENET: нет активного адаптера с адресом 169.254.x.x.");
   foreach(var item in adapters){cancel.ThrowIfCancellationRequested();log("Поиск MGU через "+item.Adapter+" ("+item.Local+")…");var gateway=Gateway(item.Local,6811,3500);if(gateway==null)continue;var hu=HuAddress(gateway,item.Local,6801,5000);if(hu!=null){item.Host=hu;log("MGU найден: "+hu);return item;}}
   throw new InvalidOperationException("Шлюз не сообщил адрес MGU. Проверьте ENET и включённую систему; при необходимости укажите IP вручную.");
  }
  public static string Gateway(string local,int port,int timeout) {
   var sockets=new List<UdpClient>();try{
    var send=new UdpClient(AddressFamily.InterNetwork);send.ExclusiveAddressUse=false;send.Client.SetSocketOption(SocketOptionLevel.Socket,SocketOptionName.ReuseAddress,true);
    try{send.Client.Bind(new IPEndPoint(IPAddress.Parse(local),port));}catch{send.Client.Bind(new IPEndPoint(IPAddress.Parse(local),0));}send.EnableBroadcast=true;sockets.Add(send);
    try{var any=new UdpClient(AddressFamily.InterNetwork);any.ExclusiveAddressUse=false;any.Client.SetSocketOption(SocketOptionLevel.Socket,SocketOptionName.ReuseAddress,true);any.Client.Bind(new IPEndPoint(IPAddress.Any,port));sockets.Add(any);}catch{}
    var deadline=DateTime.UtcNow.AddMilliseconds(timeout);var next=DateTime.MinValue;
    while(DateTime.UtcNow<deadline){if(DateTime.UtcNow>=next){foreach(var ip in new[]{"169.254.255.255","255.255.255.255"})try{send.Send(Ident,Ident.Length,new IPEndPoint(IPAddress.Parse(ip),port));}catch{}next=DateTime.UtcNow.AddMilliseconds(700);}
     foreach(var socket in sockets)if(socket.Available>0){var peer=new IPEndPoint(IPAddress.Any,0);var b=socket.Receive(ref peer);if(!b.SequenceEqual(Ident)&&peer.Address.ToString().StartsWith("169.254.",StringComparison.Ordinal))return peer.Address.ToString();}Thread.Sleep(30);
    }return null;
   }finally{foreach(var s in sockets)s.Dispose();}
  }
  public static byte[] Frame(byte[] uds){var b=new byte[8+uds.Length];var n=uds.Length+2;b[0]=(byte)(n>>24);b[1]=(byte)(n>>16);b[2]=(byte)(n>>8);b[3]=(byte)n;b[5]=1;b[6]=0xf4;b[7]=0x63;Buffer.BlockCopy(uds,0,b,8,uds.Length);return b;}
  public static string Address(byte[] uds){if(uds.Length<8||uds[0]!=0x62||uds[1]!=0x17||uds[2]!=0x2a)return null;var ip=new IPAddress(uds.Skip(4).Take(4).ToArray());return ip.ToString().StartsWith("169.254.",StringComparison.Ordinal)?ip.ToString():null;}
  static byte[] Read(Stream s,int count){var b=new byte[count];var at=0;while(at<count){int n=s.Read(b,at,count-at);if(n==0)throw new EndOfStreamException();at+=n;}return b;}
  public static string HuAddress(string gateway,string local,int port,int timeout){try{using(var c=new TcpClient(AddressFamily.InterNetwork)){c.Client.Bind(new IPEndPoint(IPAddress.Parse(local),0));var ar=c.BeginConnect(gateway,port,null,null);if(!ar.AsyncWaitHandle.WaitOne(timeout))return null;c.EndConnect(ar);c.ReceiveTimeout=timeout;c.SendTimeout=timeout;var stream=c.GetStream();var q=Frame(new byte[]{0x22,0x17,0x2a});stream.Write(q,0,q.Length);var end=DateTime.UtcNow.AddMilliseconds(timeout);while(DateTime.UtcNow<end){var h=Read(stream,6);long len=((long)h[0]<<24)|((long)h[1]<<16)|((long)h[2]<<8)|h[3];if(len<2||len>4096)return null;var b=Read(stream,(int)len);if(h[4]!=0||h[5]!=1)continue;var a=Address(b.Skip(2).ToArray());if(a!=null)return a;}return null;}}catch{return null;}}
  public static bool Banner(Target t){try{using(var c=new TcpClient(AddressFamily.InterNetwork)){if(!String.IsNullOrEmpty(t.Local))c.Client.Bind(new IPEndPoint(IPAddress.Parse(t.Local),0));var ar=c.BeginConnect(t.Host,t.Port,null,null);if(!ar.AsyncWaitHandle.WaitOne(3000))return false;c.EndConnect(ar);c.ReceiveTimeout=3000;var b=new byte[255];int n=c.GetStream().Read(b,0,b.Length);return n>4&&Encoding.ASCII.GetString(b,0,n).StartsWith("SSH-",StringComparison.Ordinal);}}catch{return false;}}
 }
 // The loopback relay binds its outbound socket to the detected ENET adapter.
 // No routing table or network configuration is changed.
 public sealed class Relay : IDisposable {
  readonly TcpListener listener;readonly Target target;readonly List<TcpClient> clients=new List<TcpClient>();volatile bool stopped;
  public int Port {get{return ((IPEndPoint)listener.LocalEndpoint).Port;}}
  public Relay(Target t){target=t;listener=new TcpListener(IPAddress.Loopback,0);listener.Start();Task.Run((Action)Accept);}
  void Accept(){while(!stopped){TcpClient local=null;try{local=listener.AcceptTcpClient();var captured=local;Task.Run(()=>Forward(captured));}catch{if(!stopped&&local!=null)local.Close();}}}
  void Forward(TcpClient local){var remote=new TcpClient(AddressFamily.InterNetwork);lock(clients){if(stopped||clients.Count>=8){local.Close();remote.Close();return;}clients.Add(local);clients.Add(remote);}try{if(!String.IsNullOrEmpty(target.Local))remote.Client.Bind(new IPEndPoint(IPAddress.Parse(target.Local),0));var ar=remote.BeginConnect(target.Host,target.Port,null,null);if(!ar.AsyncWaitHandle.WaitOne(5000))return;remote.EndConnect(ar);var a=local.GetStream();var b=remote.GetStream();var f=Task.Run(()=>a.CopyTo(b));var r=Task.Run(()=>b.CopyTo(a));Task.WaitAny(f,r);}catch{}finally{local.Close();remote.Close();lock(clients){clients.Remove(local);clients.Remove(remote);}}}
  public void Dispose(){stopped=true;listener.Stop();lock(clients){foreach(var c in clients)c.Close();clients.Clear();}}
 }
 public sealed class Credentials { public string User="root",KeyFile="",Secret=""; }
 public sealed class CommandResult {public int Code;public string Output,Error;}
 public interface IRemote:IDisposable {CommandResult Execute(string command,int timeoutSeconds);void Upload(Stream input,string path,Action<ulong> progress);string Fingerprint{get;}}
 public sealed class Remote : IRemote {
  readonly Relay relay;readonly SshClient ssh;SftpClient sftp;readonly Credentials credentials;readonly Func<string,bool> trust;readonly List<PrivateKeyFile> keys=new List<PrivateKeyFile>();string fingerprint;
  public string Fingerprint{get{return fingerprint;}}
  ConnectionInfo Info(){var auth=new List<AuthenticationMethod>();if(!String.IsNullOrEmpty(credentials.KeyFile)){var key=String.IsNullOrEmpty(credentials.Secret)?new PrivateKeyFile(credentials.KeyFile):new PrivateKeyFile(credentials.KeyFile,credentials.Secret);keys.Add(key);auth.Add(new PrivateKeyAuthenticationMethod(credentials.User,key));}else {auth.Add(new PasswordAuthenticationMethod(credentials.User,credentials.Secret));var kb=new KeyboardInteractiveAuthenticationMethod(credentials.User);kb.AuthenticationPrompt+=(s,e)=>{foreach(var p in e.Prompts)p.Response=credentials.Secret;};auth.Add(kb);}return new ConnectionInfo("127.0.0.1",relay.Port,credentials.User,auth.ToArray()){Timeout=TimeSpan.FromSeconds(10)};}
  void Host(object sender,HostKeyEventArgs e){string fp;using(var h=SHA256.Create())fp="SHA256:"+Convert.ToBase64String(h.ComputeHash(e.HostKey)).TrimEnd('=');e.CanTrust=fingerprint==fp||(fingerprint==null&&trust(fp));if(e.CanTrust)fingerprint=fp;}
  public Remote(Target t,Credentials c,Func<string,bool> confirm){credentials=c;trust=confirm;relay=new Relay(t);try{ssh=new SshClient(Info());ssh.HostKeyReceived+=Host;ssh.Connect();}catch{Dispose();throw;}}
  public CommandResult Execute(string command,int timeoutSeconds){using(var c=ssh.CreateCommand(command)){c.CommandTimeout=TimeSpan.FromSeconds(timeoutSeconds);string output=c.Execute();object code=c.ExitStatus;if(code==null)throw new IOException("SSH command interrupted");return new CommandResult{Code=Convert.ToInt32(code),Output=output,Error=c.Error};}}
  public void Upload(Stream input,string path,Action<ulong> progress){if(sftp==null){sftp=new SftpClient(Info());sftp.HostKeyReceived+=Host;sftp.OperationTimeout=TimeSpan.FromSeconds(30);sftp.Connect();}sftp.UploadFile(input,path+".part",true,progress);sftp.ChangePermissions(path+".part",384);sftp.RenameFile(path+".part",path);}
  public void Dispose(){if(sftp!=null)sftp.Dispose();if(ssh!=null)ssh.Dispose();if(relay!=null)relay.Dispose();foreach(var k in keys)k.Dispose();}
 }
}
