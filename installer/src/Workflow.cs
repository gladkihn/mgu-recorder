using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

namespace RecorderInstaller {
 public static class Data {
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=16777216,RecursionLimit=128};
  public static string Stringify(object v){lock(Json)return Json.Serialize(v);}
  public static Dictionary<string,object> Parse(string s){lock(Json)return (Dictionary<string,object>)Json.DeserializeObject(s);}
  public static string Text(Dictionary<string,object> d,string k,string fallback=""){object v;return d!=null&&d.TryGetValue(k,out v)&&v!=null?Convert.ToString(v):fallback;}
  public static bool Flag(Dictionary<string,object> d,string k){object v;return d!=null&&d.TryGetValue(k,out v)&&v is bool&&(bool)v;}
  public static Dictionary<string,object> Object(Dictionary<string,object> d,string k){object v;return d!=null&&d.TryGetValue(k,out v)?v as Dictionary<string,object>:null;}
  public static IEnumerable<object> Array(Dictionary<string,object> d,string k){object v;return d!=null&&d.TryGetValue(k,out v)&&v is object[]?(object[])v:new object[0];}
 }
 public sealed class Asset {public string Name,Resource,Sha;public long Bytes;}
 public static class Payload {
  static Dictionary<string,object> manifest;
  public static string Hash(Stream s){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant();}
  public static Stream Open(string logical){var s=Assembly.GetExecutingAssembly().GetManifestResourceStream(logical);if(s==null)throw new IOException("Installer resource missing: "+logical);return s;}
  public static string Read(string logical){using(var s=Open(logical))using(var r=new StreamReader(s,Encoding.UTF8))return r.ReadToEnd();}
  public static Dictionary<string,object> Manifest {get{if(manifest==null)manifest=Data.Parse(Read("bundle.index"));return manifest;}}
  public static List<Asset> Assets {get{return Data.Array(Manifest,"files").Cast<Dictionary<string,object>>().Select(d=>new Asset{Name=Data.Text(d,"path"),Resource=Data.Text(d,"resource"),Sha=Data.Text(d,"sha256"),Bytes=Convert.ToInt64(d["bytes"])}).ToList();}}
  public static void Verify(Action<string> log){foreach(var a in Assets){if(a.Name.StartsWith("/")||a.Name.Split('/').Contains(".."))throw new IOException("Unsafe resource path");using(var s=Open(a.Resource))if(s.Length!=a.Bytes||Hash(s)!=a.Sha)throw new IOException("Installer payload checksum: "+a.Name);}log("Офлайн-пакеты проверены.");}
 }
 public sealed class RunLog {
  public readonly string Folder,ZipPath;readonly List<string> lines=new List<string>();public Dictionary<string,object> Result=new Dictionary<string,object>();readonly string secret,keyPath;
  public RunLog(string password,string key,string rootOverride=null){secret=password;keyPath=key;string root=rootOverride??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),"MGU Recorder Installer");try{Directory.CreateDirectory(root);}catch{root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"MGURecorderInstaller");Directory.CreateDirectory(root);}Folder=Path.Combine(root,"RESULT-"+DateTime.Now.ToString("yyyyMMdd-HHmmss")+"-"+Guid.NewGuid().ToString("N").Substring(0,6));Directory.CreateDirectory(Folder);ZipPath=Folder+".zip";Result["schema"]=1;Result["created"]=DateTime.UtcNow.ToString("o");Result["privateKeysIncluded"]=false;Result["passwordIncluded"]=false;Result["vinRequired"]=false;}
  public string Redact(string text){text=text??"";if(!String.IsNullOrEmpty(secret))text=text.Replace(secret,"[secret]");if(!String.IsNullOrEmpty(keyPath))text=text.Replace(keyPath,"[key file]");return text;}
  public void Add(string text){lock(lines)lines.Add(DateTime.UtcNow.ToString("o")+" "+Redact(text));}
  public void Save(){File.WriteAllText(Path.Combine(Folder,"RESULT.json"),Redact(Data.Stringify(Result)),new UTF8Encoding(false));lock(lines)File.WriteAllLines(Path.Combine(Folder,"installer.log"),lines.ToArray(),new UTF8Encoding(false));if(File.Exists(ZipPath))File.Delete(ZipPath);using(var f=File.Create(ZipPath))using(var z=new ZipArchive(f,ZipArchiveMode.Create))foreach(var file in Directory.GetFiles(Folder)){var entry=z.CreateEntry(Path.GetFileName(file),CompressionLevel.Optimal);using(var o=entry.Open())using(var input=File.OpenRead(file))input.CopyTo(o);}}
 }
 public sealed class ProgressInfo {public int Percent;public string Message;}
 public sealed class Workflow {
  public const string Root="/var/opt/mgu-recorder-installer";
  readonly Action<string> log;readonly Action<ProgressInfo> progress;readonly Action<string,string> staged;
  public Workflow(Action<string> l,Action<ProgressInfo> p,Action<string,string> s=null){log=l;progress=p;staged=s;}
  public static string ComponentLabel(string id){switch(id){case "owner-dvr":return "Сервер регистратора";case "owner_dvr":return "Приложение Recorder";case "mgu-deploy":case "mgu-render":return "Общий компонент mgu-store: "+id;default:return id;}}
  public static string Quote(string s){return "'"+s.Replace("'","'\\''")+"'";}
  public static int Compare(string a,string b){if(String.IsNullOrEmpty(a))return -1;if(!Regex.IsMatch(a,@"^\d+\.\d+\.\d+$"))throw new InvalidOperationException("Неизвестный формат версии: "+a);var x=a.Split('.').Select(Int32.Parse).ToArray();var y=b.Split('.').Select(Int32.Parse).ToArray();for(int i=0;i<3;i++)if(x[i]!=y[i])return x[i]<y[i]?-1:1;return 0;}
  public Dictionary<string,object> Check(IRemote remote){var script=Payload.Read("remote.preflight");var r=remote.Execute("node - <<'__RECORDER_READONLY_CHECK__'\n"+script+"\n__RECORDER_READONLY_CHECK__",25);if(r.Code!=0)throw new InvalidOperationException("Проверка MGU не выполнена: "+r.Error);var data=Data.Parse(r.Output.Trim());return data;}
  public List<Dictionary<string,object>> Plan(Dictionary<string,object> check){var versions=Data.Object(check,"versions")??new Dictionary<string,object>();return Data.Array(Payload.Manifest,"artifacts").Cast<Dictionary<string,object>>().Where(a=>Compare(Data.Text(versions,Data.Text(a,"id"),null),Data.Text(a,"version"))<0).ToList();}
  public static void RequireSupport(Dictionary<string,object> check){if(!Data.Flag(check,"storeInstalled"))throw new InvalidOperationException("MGU Store не найден. Этот установщик не устанавливает Store и не открывает SSH.");if(!Data.Flag(check,"supported")){string why=String.Join("; ",Data.Array(check,"errors").Select(Convert.ToString));throw new InvalidOperationException("Конфигурация не поддерживается: "+why);}}
  public static bool CanUninstall(Dictionary<string,object> check){var v=Data.Object(check,"versions");return Data.Flag(check,"removalSupported")&&(!String.IsNullOrEmpty(Data.Text(v,"owner_dvr"))||!String.IsNullOrEmpty(Data.Text(v,"owner-dvr")));}
  public static void RequireRemovalSupport(Dictionary<string,object> check){if(!Data.Flag(check,"removalSupported")||!Data.Flag(check,"storeInstalled"))throw new InvalidOperationException("Для удаления нужен подтверждённый MGU ID7 с root-доступом и mgu-deploy. Нажмите «Проверить».");}
  static void RequireSuccess(CommandResult r,string stage){if(r.Code!=0)throw new IOException(stage+": "+r.Error+" "+r.Output);}
  public string Install(IRemote remote,Dictionary<string,object> before,RunLog result){RequireSupport(before);var plan=Plan(before);result.Result["before"]=before;result.Result["planned"]=plan;if(plan.Count==0){result.Result["status"]="ALREADY_CURRENT";result.Save();log("Установлены актуальные или более новые компоненты.");return null;}
   return StartJob(remote,before,result,"install",Payload.Assets);
  }
  public string Uninstall(IRemote remote,Dictionary<string,object> before,RunLog result){RequireRemovalSupport(before);result.Result["before"]=before;if(!CanUninstall(before)){result.Result["status"]="ALREADY_UNINSTALLED";result.Save();log("Регистратор уже удалён.");return null;}
   var assets=Payload.Assets.Where(a=>new[]{"job.js","uninstall.js","preflight-standalone.js"}.Contains(a.Name)).ToList();if(assets.Count!=3)throw new IOException("В установщике отсутствуют компоненты удаления.");return StartJob(remote,before,result,"uninstall",assets);
  }
  string StartJob(IRemote remote,Dictionary<string,object> before,RunLog result,string operation,List<Asset> assets){
   result.Result["operation"]=operation;
   string run="run-"+Guid.NewGuid().ToString("N"),stage=Root+"/"+run;result.Result["transaction"]=run;result.Result["status"]="UPLOADING";result.Save();
   RequireSuccess(remote.Execute("umask 077; mkdir -p "+Quote(Root+"/transactions")+" && mkdir "+Quote(stage)+" && mkdir "+Quote(stage+"/bootstrap"),15),"Подготовка каталога");
   long total=assets.Sum(a=>a.Bytes),sent=0;foreach(var a in assets){long start=sent;using(var stream=Payload.Open(a.Resource))remote.Upload(stream,stage+"/"+a.Name,n=>progress(new ProgressInfo{Percent=(int)Math.Min(65,(start+(long)n)*65/Math.Max(1,total)),Message="Передача "+a.Name}));sent+=a.Bytes;}
   byte[] beforeBytes=Encoding.UTF8.GetBytes(Data.Stringify(before));using(var m=new MemoryStream(beforeBytes))remote.Upload(m,stage+"/before.json",null);
   using(var m=new MemoryStream(Encoding.UTF8.GetBytes(Data.Stringify(new{operation=operation}))))remote.Upload(m,stage+"/operation.json",null);
   var expected=Data.Stringify(assets.Select(a=>new{path=a.Name,sha256=a.Sha,bytes=a.Bytes}).ToArray());
   string verify="const fs=require('fs'),c=require('crypto'),p="+Data.Stringify(stage)+",a="+expected+";a.forEach(x=>{const b=fs.readFileSync(p+'/'+x.path);if(b.length!==x.bytes||c.createHash('sha256').update(b).digest('hex')!==x.sha256)throw Error('CHECKSUM '+x.path);});console.log('PAYLOAD_OK');";
   RequireSuccess(remote.Execute("node - <<'__RECORDER_VERIFY__'\n"+verify+"\n__RECORDER_VERIFY__",90),"Проверка передачи");
   log(operation=="uninstall"?"Запуск удаления через mgu-deploy…":"Пакеты переданы и проверены. Запуск штатного установщика Store…");progress(new ProgressInfo{Percent=68,Message=operation=="uninstall"?"Удаление регистратора":"Установка через MGU Store"});
   // Remember the operation before starting it, even if ENET is lost with the launch reply.
   result.Result["status"]="LAUNCHING";result.Save();if(staged!=null)staged(run,operation);
   string launch="const fs=require('fs'),cp=require('child_process'),p="+Data.Stringify(stage)+",f=fs.openSync(p+'/install.log','a',384),c=cp.spawn('/usr/bin/node',[p+'/job.js'],{detached:true,stdio:['ignore',f,f]});c.unref();fs.closeSync(f);console.log(c.pid);";
   RequireSuccess(remote.Execute("node - <<'__RECORDER_START__'\n"+launch+"\n__RECORDER_START__",15),"Запуск установки");result.Result["status"]="RUNNING";result.Save();return run;
  }
  public Dictionary<string,object> Poll(IRemote remote,string id){if(!Regex.IsMatch(id??"",@"^run-[a-f0-9]{32}$"))throw new IOException("Transaction ID");string stage=Root+"/"+id;
   var js="const fs=require('fs'),p="+Data.Stringify(stage)+";let j={status:fs.existsSync(p)?'STAGED':'NOT_FOUND'};try{if(Date.now()-fs.statSync(p+'/install.log').mtime.getTime()<30000)j.status='STARTING';}catch(e){}try{j=JSON.parse(fs.readFileSync(p+'/job.json'));const boot=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();if(j.status==='RUNNING'&&j.boot!==boot)j.status='INTERRUPTED';}catch(e){}try{const f=fs.openSync(p+'/install.log','r'),s=fs.fstatSync(f),b=Buffer.alloc(Math.min(s.size,65536));fs.readSync(f,b,0,b.length,Math.max(0,s.size-b.length));fs.closeSync(f);j.log=b.toString('utf8');}catch(e){}console.log(JSON.stringify(j));";
   var r=remote.Execute("node - <<'__RECORDER_STATUS__'\n"+js+"\n__RECORDER_STATUS__",15);RequireSuccess(r,"Статус установки");return Data.Parse(r.Output.Trim());
  }
  public Dictionary<string,object> Monitor(IRemote remote,string run,RunLog result,Action<string> state){string previous="";for(int i=0;i<900;i++){var j=Poll(remote,run);string current=Data.Text(j,"status");string trace=Data.Text(j,"log");if(trace!=previous){previous=trace;state(trace);}if(current!="RUNNING"&&current!="STARTING"){bool removal=Data.Text(j,"operation")=="uninstall";result.Result["job"]=j;result.Result["operation"]=removal?"uninstall":"install";result.Result["status"]=current=="FINISHED"?(removal?"UNINSTALLED":"INSTALLED"):current;result.Add(trace);result.Save();progress(new ProgressInfo{Percent=100,Message=current=="FINISHED"?(removal?"Удаление завершено":"Установка завершена"):"Проверка результата"});return j;}Thread.Sleep(1500);}throw new IOException("Операция продолжает работать на MGU. Повторите проверку для чтения результата.");}
  public void Rollback(IRemote remote,string run,RunLog result){if(!Regex.IsMatch(run??"",@"^run-[a-f0-9]{32}$"))throw new IOException("Transaction ID");var r=remote.Execute("node "+Quote(Root+"/"+run+"/rollback.js")+" "+Quote(run),900);result.Add(r.Output);result.Add(r.Error);RequireSuccess(r,"Откат регистратора");result.Result["status"]="RECORDER_ROLLED_BACK";result.Save();log("Регистратор возвращён к состоянию до установки. Общие компоненты Store сохранены.");}
  public void Restart(IRemote remote){const string cmd="L=/var/opt/mgu-deploy/lock; if [ -e $L ] && [ $(cut -d ' ' -f 2 $L) = $(cat /proc/sys/kernel/random/boot_id) ] && kill -0 $(cut -d ' ' -f 1 $L) 2>/dev/null; then exit 3; fi; /usr/bin/nsm_control --requestRestart 7 --normal 2>&1";var r=remote.Execute(cmd,15);if(r.Code!=0||r.Output.Contains("[Error."))throw new IOException("MGU не принял штатный перезапуск: "+r.Output);log("MGU выполняет штатный перезапуск.");}
 }
}
