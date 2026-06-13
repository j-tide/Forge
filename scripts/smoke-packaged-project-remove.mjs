/** Installed-app Project picker, trust and metadata-only removal on a disposable Git repo. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
/* global window */

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const dmg = process.env.FORGE_PROJECT_REMOVE_DMG;
if (process.platform !== 'darwin' || process.arch !== 'arm64' || !dmg ||
    !existsSync(dmg)) throw new Error('Require macOS arm64 and explicit internal DMG');
const accessibility = process.env.FORGE_PROJECT_ACCESSIBILITY === '1';
const nativeRetinaTag = process.env.FORGE_PROJECT_NATIVE_RETINA_TAG;
if (nativeRetinaTag && (!accessibility || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(nativeRetinaTag))) {
  throw new Error('Native Retina Task drawer probe requires accessibility and a safe tag');
}
const nativeRetinaScreenshot = nativeRetinaTag ? join(root,'output','playwright',
  `${nativeRetinaTag}-long-task-drawer-retina-native.png`) : null;
const tag = process.env.FORGE_PROJECT_REMOVE_TAG || 'desktop-project-remove-20260926';
if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(tag)) throw new Error('Invalid screenshot tag');
const qaRoot = mkdtempSync(join(root,'output','qa','desktop-project-remove-'));
const source = join(qaRoot,'Forge 测试项目 01');
const secondName = accessibility ? `Forge 测试项目 02 ${'A'.repeat(101)}` : 'Forge 测试项目 02';
const secondSource = join(qaRoot,secondName);
const appData = join(qaRoot,'isolated-app-data');
mkdirSync(source);
function command(executable, argv, cwd=source) {
  return execFileSync(executable,argv,{cwd,encoding:'utf8',timeout:30_000}).trim();
}
command('git',['init','-b','main']);
command('git',['config','user.name','Forge fixture']);
command('git',['config','user.email','forge-fixture@example.invalid']);
writeFileSync(join(source,'package.json'),
  '{"name":"forge-project-remove-fixture","type":"module","scripts":{"test":"node test.js"}}\n');
writeFileSync(join(source,'test.js'),"console.log('fixture not executed');\n");
command('git',['add','.']);
command('git',['commit','-m','Disposable project fixture']);
const originalHead=command('git',['rev-parse','HEAD']);
const originalFile=readFileSync(join(source,'test.js'),'utf8');
mkdirSync(secondSource);
command('git',['init','-b','main'],secondSource);
command('git',['config','user.name','Forge fixture'],secondSource);
command('git',['config','user.email','forge-fixture@example.invalid'],secondSource);
writeFileSync(join(secondSource,'package.json'),'{"name":"forge-project-switch-fixture","type":"module"}\n');
command('git',['add','.'],secondSource);
command('git',['commit','-m','Disposable second project fixture'],secondSource);
const secondHead=command('git',['rev-parse','HEAD'],secondSource);
const installRoot=mkdtempSync(join(root,'build','macos','qa-install-'));
const mount=join(installRoot,'mounted');
const installed=join(installRoot,'Forge INTERNAL.app');
mkdirSync(mount);
let attached=false;
let app;
async function invoke(page,type,payload) {
  const response=await page.evaluate(async ({type,payload}) => window.forge.invokeProject({
    schemaVersion:'1.0',commandId:crypto.randomUUID(),type,
    createdAt:new Date().toISOString(),protocolVersion:'forge-host-protocol/v5',payload,
  }),{type,payload});
  assert.equal(response.ok,true,type+': '+JSON.stringify(response));
  return response.data;
}
const screenshot=(suffix)=>join(root,'output','playwright',
  `${tag}-${suffix}-${['long-project','long-task-drawer'].includes(suffix)?'1280':'1440'}x900.png`);
try {
  command('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,dmg],root);
  attached=true;
  command('ditto',[join(mount,'Forge INTERNAL.app'),installed],root);
  command('codesign',['--verify','--deep','--strict',installed],root);
  command('hdiutil',['detach',mount],root);
  attached=false;
  const launch=()=>electron.launch({
    executablePath:join(installed,'Contents','MacOS','Forge'),args:[],
    env:{...process.env,FORGE_DEV_SERVER_URL:'',FORGE_INTERNAL_TEST_HOME:appData},
  });
  app=await launch();
  let page=await app.firstWindow();
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Host connected'}).waitFor({timeout:20_000});
  await page.getByRole('button',{name:'项目',exact:true}).click();
  await page.getByRole('heading',{name:'选择一个项目'}).waitFor();
  await page.screenshot({path:screenshot('choose')});
  await app.evaluate(({dialog})=>{ dialog.showOpenDialog=async()=>({
    canceled:true,filePaths:[],
  }); });
  await page.getByRole('button',{name:'Choose folder'}).click();
  assert.deepEqual(await invoke(page,'project.list',{}),[]);
  await app.evaluate(({dialog},path)=>{ dialog.showOpenDialog=async()=>({
    canceled:false,filePaths:[path],
  }); },source);
  await page.getByRole('button',{name:'Choose folder'}).click();
  await page.getByText('Git repository').waitFor();
  await page.getByText('main',{exact:true}).first().waitFor();
  assert.equal(command('git',['status','--porcelain']),'');
  await page.screenshot({path:screenshot('detected')});
  await page.getByRole('button',{name:'继续查看信任范围'}).click();
  await page.getByRole('heading',{name:'Trust this project?'}).waitFor();
  assert.deepEqual(await invoke(page,'project.list',{}),[]);
  await page.screenshot({path:screenshot('trust')});
  await page.getByRole('button',{name:'Trust this project'}).click();
  await page.getByText('PROJECT CONNECTED').waitFor({timeout:15_000});
  const saved=await invoke(page,'project.list',{});
  assert.equal(saved.length,1);
  assert.equal(saved[0].trusted,true);
  assert.equal(saved[0].rootPath,realpathSync(source));
  await page.getByRole('button',{name:'连接其他项目'}).click();
  await app.evaluate(({dialog},path)=>{ dialog.showOpenDialog=async()=>({
    canceled:false,filePaths:[path],
  }); },secondSource);
  await page.getByRole('button',{name:'Choose folder'}).click();
  await page.getByRole('button',{name:'继续查看信任范围'}).click();
  await page.getByRole('button',{name:'Trust this project'}).click();
  const withTwo=await invoke(page,'project.list',{});
  assert.equal(withTwo.length,2);
  const second=withTwo.find((item)=>item.rootPath===realpathSync(secondSource));
  assert.ok(second);
  assert.equal((await invoke(page,'project.active',{})).projectId,second.projectId);
  if (accessibility) {
    await page.setViewportSize({width:1280,height:900});
    const longCard=page.locator('.saved-project').filter({hasText:'Forge 测试项目 02'});
    assert.equal(await longCard.locator('strong').textContent(),secondName);
    assert.equal(await longCard.locator('p').getAttribute('title'),realpathSync(secondSource));
    const layout=await page.evaluate(()=>({
      documentWidth:globalThis.document.documentElement.scrollWidth,
      viewportWidth:globalThis.innerWidth,
    }));
    assert.ok(layout.documentWidth<=layout.viewportWidth,
      `Long project title overflows viewport: ${JSON.stringify(layout)}`);
    const removeButton=longCard.getByRole('button',{name:'Remove from Forge'});
    assert.equal(await removeButton.isVisible(),true);
    assert.equal(await removeButton.isEnabled(),true);
    await page.screenshot({path:screenshot('long-project')});
    await page.setViewportSize({width:1440,height:900});
  }
  await page.locator('.saved-project').filter({hasText:'Forge 测试项目 01'})
    .getByRole('button',{name:'切换'}).click();
  await page.getByRole('heading',{name:'Forge 测试项目 01'}).waitFor();
  assert.equal((await invoke(page,'project.active',{})).projectId,saved[0].projectId);
  await page.screenshot({path:screenshot('switched')});
  let accessibilityTaskId=null;
  if (accessibility) {
    const longTaskTitle='任务详情键盘与长标题验证'.repeat(10);
    await page.getByRole('button',{name:'研发看板'}).click();
    await page.getByRole('button',{name:'手工创建任务'}).click();
    const manual=page.getByRole('dialog',{name:'手工创建任务草稿'});
    await manual.getByRole('textbox',{name:'任务标题'}).fill(longTaskTitle);
    await manual.getByRole('textbox',{name:'目标'}).fill('验证已安装应用的任务抽屉可读性与键盘操作；不启动执行器。');
    await manual.getByRole('textbox',{name:'验收条件'}).fill('长标题完整可读，焦点留在抽屉并在关闭后回到任务卡片。');
    await manual.getByRole('button',{name:'保存手工草稿'}).click();
    const draft=page.getByRole('dialog',{name:'Task Draft · 编辑与澄清'});
    await draft.getByRole('button',{name:'提交审批请求'}).click();
    await draft.getByLabel('我已审阅当前目标、验收和范围').check();
    await draft.getByRole('button',{name:'批准并加入 TODO'}).click();
    await draft.getByText('已批准 · TODO · 尚未开工。', {exact:false}).waitFor();
    await draft.getByRole('button',{name:'关闭抽屉'}).click();
    const card=page.locator('.board-task').filter({hasText:longTaskTitle});
    await card.waitFor();
    accessibilityTaskId=await card.getAttribute('data-task-id');
    assert.match(accessibilityTaskId,/^[0-9a-f-]{36}$/);
    assert.equal(await card.getAttribute('title'),longTaskTitle);
    const runs=await page.evaluate(async ({projectId,taskId})=>window.forge.invokeRun({
      schemaVersion:'1.0',commandId:crypto.randomUUID(),type:'run.list',
      createdAt:new Date().toISOString(),protocolVersion:'forge-host-protocol/v5',
      payload:{projectId,taskId},
    }),{projectId:saved[0].projectId,taskId:accessibilityTaskId});
    assert.equal(runs.ok,true,JSON.stringify(runs));
    assert.deepEqual(runs.data,[],'Manual approval must not start an Executor Run');
    await card.focus();
    await page.keyboard.press('Enter');
    const detail=page.getByRole('dialog',{name:'任务详情'});
    await detail.getByRole('heading',{name:longTaskTitle}).waitFor();
    await page.setViewportSize({width:1280,height:900});
    await detail.evaluate((element)=>Promise.all(element.getAnimations().map((animation)=>animation.finished)));
    for (const zoom of [1,1.25,1.5]) {
      const layout=await detail.evaluate((element,scale)=>{
        globalThis.document.body.style.zoom=String(scale);
        return {pageWidth:globalThis.document.documentElement.scrollWidth,
          viewportWidth:globalThis.innerWidth,panelWidth:element.clientWidth,
          panelScrollWidth:element.scrollWidth,
          closeRight:element.querySelector('[aria-label="关闭抽屉"]')?.getBoundingClientRect().right};
      },zoom);
      assert.ok(layout.pageWidth<=layout.viewportWidth &&
        layout.panelScrollWidth<=layout.panelWidth && layout.closeRight<=layout.viewportWidth,
      `Task drawer clips content at ${zoom}: ${JSON.stringify(layout)}`);
    }
    await detail.getByRole('button',{name:'关闭抽屉'}).focus();
    await page.keyboard.press('Shift+Tab');
    const lastFocus=await detail.evaluate((element)=>element.contains(globalThis.document.activeElement)
      && globalThis.document.activeElement?.getAttribute('aria-label')!=='关闭抽屉');
    assert.equal(lastFocus,true,'Shift+Tab must wrap inside the real task drawer');
    await page.keyboard.press('Tab');
    assert.equal(await detail.getByRole('button',{name:'关闭抽屉'}).evaluate((element)=>
      element===globalThis.document.activeElement),true);
    await page.screenshot({path:screenshot('long-task-drawer')});
    await page.keyboard.press('Escape');
    await detail.waitFor({state:'hidden'});
    assert.equal(await card.evaluate((element)=>element===globalThis.document.activeElement),true);
    assert.equal(await page.locator('#app').evaluate((element)=>element.inert),false);
    await page.evaluate(()=>{globalThis.document.body.style.zoom='';});
    await page.setViewportSize({width:1440,height:900});
    assert.equal(command('git',['status','--porcelain']),'');
    await page.getByRole('button',{name:'项目',exact:true}).click();
  }
  await page.locator('.saved-project').filter({hasText:'Forge 测试项目 02'})
    .getByRole('button',{name:'切换'}).click();
  assert.equal((await invoke(page,'project.active',{})).projectId,second.projectId);
  assert.equal(command('git',['status','--porcelain'],secondSource),'');
  const removeTrigger=page.locator('.saved-project').filter({hasText:'Forge 测试项目 02'})
    .getByRole('button',{name:'Remove from Forge'});
  await removeTrigger.click();
  const dialog=page.getByRole('dialog',{name:/Remove .* from Forge/});
  await dialog.getByText('Your project files will not be deleted.').waitFor();
  if (accessibility) {
    const close=dialog.getByRole('button',{name:'关闭对话框'});
    await page.waitForFunction(()=>globalThis.document.activeElement?.getAttribute('aria-label')==='关闭对话框');
    assert.equal(await page.locator('#app').evaluate((element)=>element.inert),true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await dialog.getByRole('button',{name:'Remove from Forge'})
      .evaluate((element)=>element===globalThis.document.activeElement),true);
    await page.keyboard.press('Tab');
    assert.equal(await close.evaluate((element)=>element===globalThis.document.activeElement),true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
    assert.equal(await removeTrigger.evaluate((element)=>element===globalThis.document.activeElement),true);
    assert.equal(await page.locator('#app').evaluate((element)=>element.inert),false);
    await removeTrigger.click();
  }
  await dialog.getByRole('button',{name:'Cancel'}).click();
  assert.equal((await invoke(page,'project.list',{})).length,2);
  await page.locator('.saved-project').filter({hasText:'Forge 测试项目 02'})
    .getByRole('button',{name:'Remove from Forge'}).click();
  await dialog.getByRole('button',{name:'Remove from Forge'}).click();
  await page.getByRole('heading',{name:'Choose project'}).waitFor();
  assert.equal((await invoke(page,'project.list',{})).length,1);
  assert.equal(command('git',['rev-parse','HEAD'],secondSource),secondHead);
  assert.equal(command('git',['status','--porcelain'],secondSource),'');
  assert.ok(existsSync(join(secondSource,'.git')));
  assert.equal(command('git',['rev-parse','HEAD']),originalHead);
  assert.equal(command('git',['status','--porcelain']),'');
  assert.equal(readFileSync(join(source,'test.js'),'utf8'),originalFile);
  assert.ok(existsSync(join(source,'.git')));
  await page.screenshot({path:screenshot('removed')});
  await app.close();
  app=await launch();
  page=await app.firstWindow();
  await page.getByRole('button',{name:'Host connected'}).waitFor({timeout:20_000});
  assert.equal((await invoke(page,'project.list',{})).length,1);
  await page.getByRole('button',{name:'项目',exact:true}).click();
  await page.locator('.saved-project').filter({hasText:'Forge 测试项目 01'})
    .getByRole('button',{name:'切换'}).click();
  assert.equal((await invoke(page,'project.active',{})).projectId,saved[0].projectId);
  if (accessibility) {
    await page.getByRole('button',{name:'研发看板'}).click();
    const restoredCard=page.locator(`.board-task[data-task-id="${accessibilityTaskId}"]`);
    await restoredCard.waitFor();
    if (nativeRetinaScreenshot) {
      const displayScale=await app.evaluate(({screen})=>screen.getPrimaryDisplay().scaleFactor);
      const viewport=await page.evaluate(()=>({ratio:window.devicePixelRatio,
        width:window.innerWidth,height:window.innerHeight}));
      assert.ok(displayScale>=2 && viewport.ratio>=2,
        `Expected native Mac Retina, received ${displayScale}/${viewport.ratio}`);
      await restoredCard.focus();
      await page.keyboard.press('Enter');
      const nativeDetail=page.getByRole('dialog',{name:'任务详情'});
      await nativeDetail.waitFor();
      await nativeDetail.evaluate((element)=>Promise.all(element.getAnimations()
        .map((animation)=>animation.finished)));
      const layout=await nativeDetail.evaluate((element)=>({
        pageWidth:globalThis.document.documentElement.scrollWidth,
        viewportWidth:window.innerWidth,panelWidth:element.clientWidth,
        panelScrollWidth:element.scrollWidth,
        closeRight:element.querySelector('[aria-label="关闭抽屉"]')?.getBoundingClientRect().right,
      }));
      assert.ok(layout.pageWidth<=layout.viewportWidth &&
        layout.panelScrollWidth<=layout.panelWidth && layout.closeRight<=layout.viewportWidth,
      `Native Retina Task drawer clips content: ${JSON.stringify(layout)}`);
      await page.screenshot({path:nativeRetinaScreenshot,scale:'device'});
      const png=readFileSync(nativeRetinaScreenshot);
      assert.equal(png.readUInt32BE(16),Math.round(viewport.width*viewport.ratio));
      assert.equal(png.readUInt32BE(20),Math.round(viewport.height*viewport.ratio));
      await page.keyboard.press('Escape');
      await nativeDetail.waitFor({state:'hidden'});
    }
    await page.getByRole('button',{name:'项目',exact:true}).click();
  }
  await page.getByRole('button',{name:'Remove from Forge'}).first().click();
  await page.getByRole('dialog',{name:/Remove .* from Forge/})
    .getByRole('button',{name:'Remove from Forge'}).click();
  assert.deepEqual(await invoke(page,'project.list',{}),[]);
  assert.equal(command('git',['rev-parse','HEAD']),originalHead);
  console.log(JSON.stringify({stage:'packaged-project-metadata-only-remove',
    dmg,qaRoot,projectId:saved[0].projectId,pickerCancel:true,trustPersisted:true,
    switchedBetweenProjects:true,removeCancelled:true,removedAfterRestart:true,
    sourceClean:true,accessibility,accessibilityTaskId,nativeRetinaScreenshot,
    screenshots:['choose','detected','trust','switched','removed',
      ...(accessibility?['long-project','long-task-drawer']:[])].map(screenshot)}));
} finally {
  await app?.close();
  if (attached) command('hdiutil',['detach',mount],root);
  rmSync(installRoot,{recursive:true,force:true});
}
