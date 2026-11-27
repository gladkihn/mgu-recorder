"""Independent owner_dvr OAP resources and source package; no DVR template input."""
from pathlib import Path
import io,json,tarfile,uuid,gzip

def build_app(p,d,version,native):
 tree=f'owner_dvr@{version}/';files={}
 def add(name,data):files[tree+name]=data.encode() if isinstance(data,str) else data
 def js(name,obj):add(name,json.dumps(obj,ensure_ascii=False,indent=2))
 pkg={'name':'owner_dvr','version':version,'productName':'Recorder','author':'owner','license':'GPL-3.0-or-later','description':'Непрерывная запись и просмотр по времени','main':'javascript/runner.js','mguHmi':['ID7'],'mguLocalOnly':True,'mguRequires':{'owner-dvr':native,'mgu-render':'0.6.19','mgu-deploy':'0.8.11'},'oapAppSettings':{'maxDiskUsage':20971520,'cpuLimit':60,'memoryThresholdKB':196608,'priority':'PRIO_LOW','visibility':'FOREGROUND','latencyClass':'FOREGROUND','loggingId':'ODVR','userLoginRequired':False,'backgroundPriority':150,'someipManifest':'manifest.json'}}
 pkg['dependencies']={}
 pkg['files']=['npm-shrinkwrap.json','icon.png','javascript','manifest.json','package.json','permissions.json','renderer','rhmiData','COPYING.GPLv3']
 js('package.json',pkg)
 js('npm-shrinkwrap.json',{'name':'owner_dvr','version':version,'lockfileVersion':1,'requires':True,'dependencies':{}})
 js('manifest.json',json.loads((p/'vendor/onlineapp-manifest.json').read_text()))
 def access(domain,interface):return {'_typeName':'joynr.infrastructure.DacTypes.MasterAccessControlEntry','uid':'${APPNAME}','domain':domain,'interfaceName':interface,'defaultRequiredTrustLevel':'HIGH','possibleRequiredTrustLevels':[],'defaultRequiredControlEntryChangeTrustLevel':'HIGH','possibleRequiredControlEntryChangeTrustLevels':[],'operation':'*','defaultConsumerPermission':'YES','possibleConsumerPermissions':[]}
 acl=[access('de.bmw.infotainment.telematic.oap.oapcontroller','de/bmw/infotainment/telematic/oapcontroller/OAPController'),access('de.bmw.infotainment.telematic.oap.appStatus_${APPNAME}','de/bmw/infotainment/telematic/oap/appstatus/AppStatus'),access('de.bmw.infotainment.telematic.oap.appstart','de/bmw/infotainment/telematic/oap/appstart/AppStart'),access('de.bmw.infotainment.telematic.oap.privateEntryPoint_${APPNAME}','de/bmw/infotainment/telematic/oap/privateentrypoint/PrivateEntryPoint')]
 reg={'_typeName':'joynr.infrastructure.DacTypes.MasterRegistrationControlEntry','uid':'${APPNAME}','domain':'de.bmw.infotainment.telematic.oap.heartbeat_${APPNAME}','interfaceName':'de/bmw/infotainment/telematic/oap/heartbeat/HeartbeatMonitor','defaultRequiredTrustLevel':'HIGH','possibleRequiredTrustLevels':[],'defaultRequiredControlEntryChangeTrustLevel':'HIGH','possibleRequiredControlEntryChangeTrustLevels':[],'defaultProviderPermission':'YES','possibleProviderPermissions':[]}
 js('permissions.json',{'masterAccessTable':acl,'masterRegistrationTable':[reg],'mediatorAccessTable':[],'ownerAccessTable':[],'mediatorRegistrationTable':[],'ownerRegistrationTable':[],'domainRoleTable':[]})
 def uid(name):return str(uuid.uuid5(uuid.NAMESPACE_URL,'owner-dvr/'+name))
 app={'uuid':uid('app'),'type':'OnlineApp','name':'owner_dvr','vendor':'owner','version':version,'defaultLanguage':'en_GB','uiDescriptions':[{'applicationFilePath':'./uiDescriptions/ID7/application.xml','uiDescriptionFilePath':'./uiDescriptions/ID7/uiDescription.json','hmi':['ID7']}],'stringBundleUuid':uid('strings'),'resourceBundleUuid':uid('resources'),'variantGroups':[{'stringsPath':'./variantGroups/Common/texts','hmi':['ID7'],'brands':['BMW'],'resourcesPath':'./resources'}],'entryPoints':[{'uuid':uid('entry'),'textId':'SID_ENTRY','insertionStateId':20974,'insertionFocusId':2,'appearance':'DEFAULT','insertionMode':'INSERT_BELOW','insertionOrder':0,'insertionPriority':0,'insertionGroup':0,'isGroupHeader':False,'bookmarkable':True,'previewType':'NONE','availability':'ENABLED','icon':'owner_dvr_icon.png'}],'appletId':20105,'bookmarkUuidPool':[uid('bookmarks'),1,2,3,4,5,6,7]}
 js('rhmiData/application.json',{'schemaVersion':'1.0.0','application':app})
 strings={'SID_0':'Регистратор','SID_1':'Нет соединения с экраном','SID_2':'Повторить'}
 for lang in ['en_GB','en_US','ru_RU']:
  localized=dict(strings,SID_ENTRY='Регистратор' if lang=='ru_RU' else 'Recorder');js('rhmiData/variantGroups/Common/texts/'+lang+'.json',localized);js('rhmiData/strings/'+lang+'.json',localized)
 xml='''<?xml version="1.0" encoding="UTF-8"?><application>
 <container id="1000" type="logical"><layoutGroup id="1100"><component id="1110" type="bookmark"/></layoutGroup></container>
 <container id="3000" type="state" widget="LT_State_Wide"><layoutGroup id="3200" name="Titlebar"><component id="3220" type="title"><property id="2" value="1"/></component></layoutGroup><layoutGroup id="3400" name="List"><property id="3" value="1"/></layoutGroup></container>
 <container id="4000" type="state" widget="LT_State_Wide"><property id="9" value="3000"/><layoutGroup id="4200" name="Titlebar"><component id="4220" type="title"><property id="2" value="1"/></component></layoutGroup><layoutGroup id="4400" name="List"><property id="3" value="1"/><component id="4410" type="label" widget="LT_Label_4Row_1TextDyn"/><component id="4420" type="button" widget="LT_Button_1Row"/></layoutGroup></container>
 </application>'''
 add('rhmiData/uiDescriptions/ID7/application.xml',xml)
 def title(name,sid):return {'type':'title','name':name,'rows':[{'Text':{'type':'StringId','value':sid}}]}
 js('rhmiData/uiDescriptions/ID7/uiDescription.json',{'schemaVersion':'1.3.0','containers':{'1000':{'type':'logical','name':'logicalContainer','components':{'1110':{'type':'bookmark','name':'bookmark'}}},'3000':{'type':'state','name':'record','components':{'3220':title('recordTitle','SID_0')}},'4000':{'type':'state','name':'fallback','properties':{'ParentState':{'value':3000,'type':'UInt'}},'components':{'4220':title('fallbackTitle','SID_0'),'4410':{'type':'label','name':'fbText','rows':[{'Text':{'value':'SID_1','type':'StringId'}}]},'4420':{'type':'button','name':'fbRetry','rows':[{'Text':{'value':'SID_2','type':'StringId'}}]}}}}})
 icon=(p/'ui/icon.png').read_bytes();add('icon.png',icon);add('rhmiData/resources/owner_dvr_icon.png',icon);add('COPYING.GPLv3',(p/'LICENSE').read_bytes())
 for f in (p/'ui').rglob('*'):
  if f.is_file() and f.name not in ['main.js','online-host.js','icon.png']:add('renderer/'+f.relative_to(p/'ui').as_posix(),f.read_bytes())
 for name in ['main.js','online-host.js']:files['src/'+name]=(p/'ui'/name).read_bytes()
 files['mgu-app.json']=json.dumps({'schema':1,'id':'owner_dvr','version':version,'tree':tree.rstrip('/'),'modules':['src/main.js','src/online-host.js'],'sdk':['oap-sdk/src/core/OnlineApp.js','oap-sdk/src/logging/logging']},indent=2).encode()
 out=d/f'owner_dvr@{version}.tgz'
 if out.exists():
  with tarfile.open(out) as t:
   assert set(t.getnames())==set(files),'Bump APP when changing application resources'
   for name,data in files.items():assert t.extractfile(name).read()==data,('Bump APP when changing application resources',name)
  return out
 with out.open('wb') as raw,gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0) as z,tarfile.open(fileobj=z,mode='w') as t:
  for name,data in files.items():
   m=tarfile.TarInfo(name);m.size=len(data);m.mode=0o644;t.addfile(m,io.BytesIO(data))
 return out
