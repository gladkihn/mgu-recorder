using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Renci.SshNet;

[assembly:AssemblyTitle("MGU Recorder Installer")]
[assembly:AssemblyProduct("MGU Recorder Installer")]
[assembly:AssemblyVersion("1.1.0.0")]
[assembly:AssemblyFileVersion("1.1.0.0")]
[assembly:AssemblyCopyright("Owner-authorised software; GPL-3.0-or-later")]

namespace RecorderInstaller {
 static class Program {
  static readonly Dictionary<string,Assembly> Loaded=new Dictionary<string,Assembly>();
  [STAThread] public static void Main(string[] args){AppDomain.CurrentDomain.AssemblyResolve+=Resolve;
   try{if(args.Length>0&&args[0]=="--self-test"){RunTests(args.Length>1?args[1]:"SELFTEST.json");return;}Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Start(args);}
   catch(Exception e){if(args.Length>1&&args[0]=="--self-test")File.WriteAllText(args[1],"{\"status\":\"FAIL\",\"error\":"+JsonQuote(e.ToString())+"}");else MessageBox.Show(e.Message,"MGU Recorder Installer",MessageBoxButtons.OK,MessageBoxIcon.Error);Environment.ExitCode=1;}}
  static string JsonQuote(string s){return "\""+s.Replace("\\","\\\\").Replace("\"","\\\"").Replace("\r","\\r").Replace("\n","\\n")+"\"";}
  static Assembly Resolve(object sender,ResolveEventArgs args){string name=new AssemblyName(args.Name).Name;if(!System.Text.RegularExpressions.Regex.IsMatch(name,@"^[A-Za-z0-9_.-]+$"))return null;lock(Loaded){Assembly a;if(Loaded.TryGetValue(name,out a))return a;using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("library."+name+".dll")){if(stream==null)return null;using(var m=new MemoryStream()){stream.CopyTo(m);a=Assembly.Load(m.ToArray());Loaded[name]=a;return a;}}}}
  [MethodImpl(MethodImplOptions.NoInlining)] static void Start(string[] args){var form=new MainForm();if(args.Length>1&&args[0]=="--preview")form.Render(args[1]);else Application.Run(form);}
  [MethodImpl(MethodImplOptions.NoInlining)] static void RunTests(string output){SelfTests.Run(output);}
 }
 static class SelfTests {
  sealed class FakeRemote:IRemote {public int Writes,Uploads;public string Json;public readonly Dictionary<string,byte[]> Files=new Dictionary<string,byte[]>();public string Fingerprint{get{return "fixture";}}public CommandResult Execute(string c,int t){if(c.Contains("mkdir ")||c.Contains("__RECORDER_START__"))Writes++;return new CommandResult{Code=0,Output=Json,Error=""};}public void Upload(Stream s,string p,Action<ulong> f){Uploads++;using(var m=new MemoryStream()){s.CopyTo(m);Files[p]=m.ToArray();}}public void Dispose(){}}
  static void Assert(bool v,string text){if(!v)throw new Exception("Self-test: "+text);}
  static byte[] DerLength(int n){if(n<128)return new[]{(byte)n};var b=new List<byte>();while(n>0){b.Insert(0,(byte)(n&255));n>>=8;}b.Insert(0,(byte)(128+b.Count));return b.ToArray();}
  static byte[] DerInteger(byte[] n){var b=n.SkipWhile(v=>v==0).ToArray();if(b.Length==0)b=new byte[]{0};if((b[0]&128)!=0)b=new byte[]{0}.Concat(b).ToArray();return new byte[]{2}.Concat(DerLength(b.Length)).Concat(b).ToArray();}
  static byte[] PrivatePem(){using(var rsa=new RSACryptoServiceProvider(2048)){rsa.PersistKeyInCsp=false;var p=rsa.ExportParameters(true);var body=new byte[][]{new byte[]{0},p.Modulus,p.Exponent,p.D,p.P,p.Q,p.DP,p.DQ,p.InverseQ}.SelectMany(DerInteger).ToArray();var der=new byte[]{48}.Concat(DerLength(body.Length)).Concat(body).ToArray();return Encoding.ASCII.GetBytes("-----BEGIN RSA PRIVATE KEY-----\n"+Convert.ToBase64String(der,Base64FormattingOptions.InsertLineBreaks)+"\n-----END RSA PRIVATE KEY-----\n");}}
  public static void Run(string output){var checks=new List<string>();Payload.Verify(s=>{});checks.Add("All embedded payload and bootstrap checksums");
   Assert(Workflow.Compare("0.8.18","0.8.16")>0,"deploy downgrade");Assert(Workflow.Compare("0.6.21","0.6.19")>0,"renderer downgrade");Assert(Workflow.Compare(null,"1.0.0")<0,"new install");checks.Add("Version comparison preserves newer tools");
   var frame=Enet.Frame(new byte[]{0x22,0x17,0x2a});Assert(frame.SequenceEqual(new byte[]{0,0,0,5,0,1,0xf4,0x63,0x22,0x17,0x2a}),"HSFZ request");Assert(Enet.Address(new byte[]{0x62,0x17,0x2a,0,169,254,91,8})=="169.254.91.8","DID response");Assert(Enet.Address(new byte[]{0x7f,0x22,0x31})==null,"negative DID");checks.Add("Read-only HSFZ 22 17 2A framing and parsing");
   using(var listener=new TcpListenerScope()){var expected=new byte[]{0x63,0xf4,0x62,0x17,0x2a,0,169,254,91,8};var task=Task.Run(()=>{using(var client=listener.Listener.AcceptTcpClient()){var q=new byte[11];int n=0;while(n<q.Length)n+=client.GetStream().Read(q,n,q.Length-n);Assert(q.SequenceEqual(frame),"diagnostic request changed");var response=new byte[]{0,0,0,(byte)expected.Length,0,1}.Concat(expected).ToArray();client.GetStream().Write(response,0,response.Length);}});Assert(Enet.HuAddress("127.0.0.1","127.0.0.1",listener.Port,2000)=="169.254.91.8","TCP HSFZ discovery");Assert(task.Wait(3000),"HSFZ test completion");}checks.Add("Gateway TCP identification against local fixture");
   using(var target=new TcpListenerScope())using(var relay=new Relay(new Target{Host="127.0.0.1",Port=target.Port,Local="127.0.0.1"})){var task=Task.Run(()=>{using(var c=target.Listener.AcceptTcpClient()){var b=new byte[8192];int n=c.GetStream().Read(b,0,b.Length);c.GetStream().Write(b,0,n);}});using(var client=new TcpClient("127.0.0.1",relay.Port)){client.ReceiveTimeout=3000;var sent=Encoding.UTF8.GetBytes("adapter-bound encrypted transport fixture");client.GetStream().Write(sent,0,sent.Length);var received=new byte[sent.Length];int n=0;while(n<received.Length)n+=client.GetStream().Read(received,n,received.Length-n);Assert(sent.SequenceEqual(received),"relay changed bytes");}Assert(task.Wait(3000),"relay completion");}checks.Add("ENET adapter-bound local transport relay");
   var connection=new ConnectionInfo("127.0.0.1","root",new PasswordAuthenticationMethod("root","runtime-only"));Assert(connection.HostKeyAlgorithms.ContainsKey("ssh-ed25519"),"ED25519 host support");Assert(connection.HostKeyAlgorithms.ContainsKey("ssh-rsa"),"legacy MGU RSA host support");using(var key=new PrivateKeyFile(new MemoryStream(PrivatePem())))Assert(key!=null,"runtime-generated private key parser");checks.Add("SSH.NET dependency loading, ED25519/RSA, synthetic in-memory key parsing");
   var bad=new Dictionary<string,object>{{"supported",false},{"storeInstalled",true},{"errors",new object[]{"ICAM2 missing"}},{"versions",new Dictionary<string,object>()}};var remote=new FakeRemote{Json=Data.Stringify(bad)};var work=new Workflow(s=>{},p=>{});var testLog=new RunLog("fixture-secret-9283",@"C:\fixture\private-key",Path.Combine(Path.GetDirectoryName(Path.GetFullPath(output)),"fixtures"));bool stopped=false;try{work.Install(remote,bad,testLog);}catch(InvalidOperationException){stopped=true;}Assert(stopped&&remote.Writes==0&&remote.Uploads==0,"unsupported target mutated");bad["storeInstalled"]=false;stopped=false;try{work.Install(remote,bad,testLog);}catch(InvalidOperationException){stopped=true;}Assert(stopped&&remote.Writes==0,"missing Store mutated");checks.Add("Unsupported hardware and absent Store stop before remote writes");
   var newer=new Dictionary<string,object>{{"versions",new Dictionary<string,object>{{"mgu-deploy","0.8.18"},{"mgu-render","0.6.21"},{"owner-dvr","4.2.0"},{"owner_dvr","1.6.0"}}}};Assert(work.Plan(newer).Count==0,"newer installation must stay");checks.Add("Already newer installation has an empty change plan");
   Assert(!Workflow.CanUninstall(null)&&!Workflow.CanUninstall(bad),"removal requires checked MGU");var removal=new Dictionary<string,object>{{"removalSupported",true},{"storeInstalled",true},{"supported",false},{"versions",new Dictionary<string,object>{{"owner_dvr","1.5.1"},{"owner-dvr","4.1.0"}}}};Assert(Workflow.CanUninstall(removal),"broken recording hardware must not block removal");
   var removalRemote=new FakeRemote{Json="{}"};string stagedRun=null;var removalWork=new Workflow(s=>{},p=>{},(run,op)=>{Assert(op=="uninstall"&&removalRemote.Writes==1,"persist removal before detached start");stagedRun=run;});string removalRun=removalWork.Uninstall(removalRemote,removal,testLog);Assert(removalRun==stagedRun&&removalRemote.Uploads==5,"small removal payload");Assert(removalRemote.Files.Keys.All(p=>!p.EndsWith(".tgz")),"removal must not upload installation archives");Assert(removalRemote.Files.Keys.Any(p=>p.EndsWith("/uninstall.js")),"removal script missing");Assert(Encoding.UTF8.GetString(removalRemote.Files.First(p=>p.Key.EndsWith("/operation.json")).Value).Contains("uninstall"),"wrong staged operation");checks.Add("Removal stages only its scripts and persists operation before launch");
   removalRemote.Json="{\"status\":\"FINISHED\",\"operation\":\"uninstall\",\"result\":{\"status\":\"UNINSTALLED\"}}";removalWork.Monitor(removalRemote,removalRun,testLog,s=>{});Assert(Data.Text(testLog.Result,"status")=="UNINSTALLED","RESULT labels deletion as installation");checks.Add("Completed removal is reported as UNINSTALLED in RESULT");
   testLog.Add("fixture-secret-9283 C:\\fixture\\private-key");testLog.Save();using(var f=File.OpenRead(testLog.ZipPath))using(var zip=new ZipArchive(f,ZipArchiveMode.Read))foreach(var e in zip.Entries)using(var r=new StreamReader(e.Open())){var text=r.ReadToEnd();Assert(!text.Contains("fixture-secret-9283"),"secret in RESULT");}checks.Add("RESULT ZIP contains no entered secret");
   var report=new Dictionary<string,object>{{"status","PASS"},{"checks",checks},{"payloadFiles",Payload.Assets.Count},{"framework",Environment.Version.ToString()},{"carAccessed",false},{"carInstalled",false},{"requiresVin",false},{"embeddedSshLibrary","SSH.NET 2026.0.1"}};Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output)));File.WriteAllText(output,Data.Stringify(report));
  }
  sealed class TcpListenerScope:IDisposable {public readonly TcpListener Listener;public int Port{get{return ((IPEndPoint)Listener.LocalEndpoint).Port;}}public TcpListenerScope(){Listener=new TcpListener(IPAddress.Loopback,0);Listener.Start();}public void Dispose(){Listener.Stop();}}
 }
}
