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
  await page.getByRole('button',{name:'项目管理',exact:true}).click();
  await page.locator('#projects-title').waitFor();
  await page.screenshot({path:screenshot('choose')});
  await app.evaluate(({dialog})=>{ dialog.showOpenDialog=async()=>({
    canceled:true,filePaths:[],
  }); });
  await page.getByRole('button',{name:'选择文件夹'}).click();
  assert.deepEqual(await invoke(page,'project.list',{}),[]);
  await app.evaluate(({dialog},path)=>{ dialog.showOpenDialog=async()=>({
    canceled:false,filePaths:[path],
  }); },source);
  await page.getByRole('button',{name:'选择文件夹'}).click();
  await page.locator('.project-overview-facts').getByText('Git',{exact:true}).waitFor();
  await page.getByText('main',{exact:true}).first().waitFor();
  assert.equal(command('git',['status','--porcelain']),'');
  await page.screenshot({path:screenshot('detected')});
  await page.getByRole('button',{name:'继续'}).click();
  await page.getByRole('heading',{name:'信任这个项目？'}).waitFor();
  assert.deepEqual(await invoke(page,'project.list',{}),[]);
  await page.screenshot({path:screenshot('trust')});
  await page.getByRole('button',{name:'信任并打开'}).click();
  await page.locator('.project-active-heading').getByRole('heading',
    {name:'Forge 测试项目 01'}).waitFor({timeout:15_000});
  const saved=await invoke(page,'project.list',{});
  assert.equal(saved.length,1);
  assert.equal(saved[0].trusted,true);
  assert.equal(saved[0].rootPath,realpathSync(source));
  await app.evaluate(({dialog},path)=>{ dialog.showOpenDialog=async()=>({
    canceled:false,filePaths:[path],
  }); },secondSource);
  await page.getByRole('button',{name:'选择文件夹'}).click();
  await page.getByRole('button',{name:'继续'}).click();
  await page.getByRole('button',{name:'信任并打开'}).click();
  const withTwo=await invoke(page,'project.list',{});
  assert.equal(withTwo.length,2);
  const second=withTwo.find((item)=>item.rootPath===realpathSync(secondSource));
  assert.ok(second);
  assert.equal((await invoke(page,'project.active',{})).projectId,second.projectId);
  if (accessibility) {
    await page.setViewportSize({width:1280,height:900});
    const longCard=page.locator('.project-record').filter({hasText:'Forge 测试项目 02'});
    assert.equal(await longCard.locator('strong').textContent(),secondName);
    assert.equal(await longCard.locator('.project-path').getAttribute('title'),realpathSync(secondSource));
    const layout=await page.evaluate(()=>({
      documentWidth:globalThis.document.documentElement.scrollWidth,
      viewportWidth:globalThis.innerWidth,
    }));
    assert.ok(layout.documentWidth<=layout.viewportWidth,
      `Long project title overflows viewport: ${JSON.stringify(layout)}`);
    const removeButton=longCard.getByRole('button',{name:'从 Forge 移除'});
    assert.equal(await removeButton.isVisible(),true);
    assert.equal(await removeButton.isEnabled(),true);
    await page.screenshot({path:screenshot('long-project')});
    await page.setViewportSize({width:1440,height:900});
  }
  await page.locator('.project-record').filter({hasText:'Forge 测试项目 01'})
    .getByRole('button',{name:'切换'}).click();
  await page.getByRole('heading',{name:'Forge 测试项目 01'}).waitFor();
  assert.equal((await invoke(page,'project.active',{})).projectId,saved[0].projectId);
  await page.screenshot({path:screenshot('switched')});
  let accessibilityTaskId=null;
  if (accessibility) {
    const longTaskTitle='任务详情键盘与长标题验证'.repeat(10);
    await page.getByRole('button',{name:'看板', exact:true}).click();
    await page.locator('.sidebar-new-task').click();
    const composer=page.getByRole('dialog',{name:'新建任务'});
    await composer.getByRole('textbox',{name:'描述你的想法'}).fill(longTaskTitle);
    await composer.getByRole('button',{name:'手工填写',exact:true}).click();
    const draft=composer.locator('.draft-sheet[aria-label="任务草稿编辑"]');
    await draft.getByRole('textbox',{name:'标题'}).fill(longTaskTitle);
    await draft.getByRole('textbox',{name:'目标'}).fill('验证已安装应用的任务抽屉可读性与键盘操作；不启动执行器。');
    await draft.getByRole('textbox',{name:'验收条件 ac1'}).fill('长标题完整可读，焦点留在抽屉并在关闭后回到任务卡片。');
    await draft.getByRole('textbox',{name:'本次用户决定 / 修改原因'}).fill('确认独立测试项目的任务详情键盘与长标题要求');
    await draft.getByRole('button',{name:'保存新 revision'}).click();
    await draft.getByText('修订 v2',{exact:false}).waitFor();
    await draft.getByRole('button',{name:'提交审批请求'}).click();
    await draft.getByLabel('我已审阅当前目标、验收和范围').check();
    await draft.getByRole('button',{name:'批准并加入 TODO'}).click();
    await composer.waitFor({state:'hidden'});
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
    const detail=page.locator('.forge-dialog:has(> .task-detail)');
    await detail.getByRole('heading',{name:longTaskTitle}).waitFor();
    await page.setViewportSize({width:1280,height:900});
    await detail.evaluate((element)=>Promise.all(element.getAnimations().map((animation)=>animation.finished)));
    for (const zoom of [1,1.25,1.5]) {
      const layout=await detail.evaluate((element,scale)=>{
        globalThis.document.body.style.zoom=String(scale);
        return {pageWidth:globalThis.document.documentElement.scrollWidth,
          viewportWidth:globalThis.innerWidth,panelWidth:element.clientWidth,
          panelScrollWidth:element.scrollWidth,
          closeRight:element.querySelector('[aria-label="关闭对话框"]')?.getBoundingClientRect().right};
      },zoom);
      assert.ok(layout.pageWidth<=layout.viewportWidth &&
        layout.panelScrollWidth<=layout.panelWidth && layout.closeRight<=layout.viewportWidth,
      `Task drawer clips content at ${zoom}: ${JSON.stringify(layout)}`);
    }
    await detail.getByRole('button',{name:'关闭对话框'}).focus();
    await page.keyboard.press('Shift+Tab');
    const lastFocus=await detail.evaluate((element)=>element.contains(globalThis.document.activeElement)
      && globalThis.document.activeElement?.getAttribute('aria-label')!=='关闭对话框');
    assert.equal(lastFocus,true,'Shift+Tab must wrap inside the real task drawer');
    await page.keyboard.press('Tab');
    assert.equal(await detail.getByRole('button',{name:'关闭对话框'}).evaluate((element)=>
      element===globalThis.document.activeElement),true);
    await page.screenshot({path:screenshot('long-task-drawer')});
    await page.keyboard.press('Escape');
    await detail.waitFor({state:'hidden'});
    assert.equal(await card.evaluate((element)=>element===globalThis.document.activeElement),true);
    assert.equal(await page.locator('#app').evaluate((element)=>element.inert),false);
    await page.evaluate(()=>{globalThis.document.body.style.zoom='';});
    await page.setViewportSize({width:1440,height:900});
    assert.equal(command('git',['status','--porcelain']),'');
    await page.getByRole('button',{name:'项目管理',exact:true}).click();
  }
  await page.locator('.project-record').filter({hasText:'Forge 测试项目 02'})
    .getByRole('button',{name:'切换'}).click();
  assert.equal((await invoke(page,'project.active',{})).projectId,second.projectId);
  assert.equal(command('git',['status','--porcelain'],secondSource),'');
  const removeTrigger=page.locator('.project-record').filter({hasText:'Forge 测试项目 02'})
    .getByRole('button',{name:'从 Forge 移除'});
  await removeTrigger.click();
  const dialog=page.getByRole('dialog',{name:/从 Forge 移除/});
  await dialog.getByText('你的源码、Git 仓库和项目文件不会被删除。').waitFor();
  if (accessibility) {
    const close=dialog.getByRole('button',{name:'关闭对话框'});
    await page.waitForFunction(()=>globalThis.document.activeElement?.getAttribute('aria-label')==='关闭对话框');
    assert.equal(await page.locator('#app').evaluate((element)=>element.inert),true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await dialog.getByRole('button',{name:'从 Forge 移除'})
      .evaluate((element)=>element===globalThis.document.activeElement),true);
    await page.keyboard.press('Tab');
    assert.equal(await close.evaluate((element)=>element===globalThis.document.activeElement),true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
    assert.equal(await removeTrigger.evaluate((element)=>element===globalThis.document.activeElement),true);
    assert.equal(await page.locator('#app').evaluate((element)=>element.inert),false);
    await removeTrigger.click();
  }
  await dialog.getByRole('button',{name:'取消'}).click();
  assert.equal((await invoke(page,'project.list',{})).length,2);
  await page.locator('.project-record').filter({hasText:'Forge 测试项目 02'})
    .getByRole('button',{name:'从 Forge 移除'}).click();
  await dialog.getByRole('button',{name:'从 Forge 移除'}).click();
  await page.locator('#projects-title').waitFor();
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
  await page.getByRole('button',{name:'项目管理',exact:true}).click();
  await page.locator('.project-record').filter({hasText:'Forge 测试项目 01'})
    .getByRole('button',{name:'切换'}).click();
  assert.equal((await invoke(page,'project.active',{})).projectId,saved[0].projectId);
  if (accessibility) {
    await page.getByRole('button',{name:'看板', exact:true}).click();
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
      const nativeDetail=page.locator('.forge-dialog:has(> .task-detail)');
      await nativeDetail.waitFor();
      await nativeDetail.evaluate((element)=>Promise.all(element.getAnimations()
        .map((animation)=>animation.finished)));
      const layout=await nativeDetail.evaluate((element)=>({
        pageWidth:globalThis.document.documentElement.scrollWidth,
        viewportWidth:window.innerWidth,panelWidth:element.clientWidth,
        panelScrollWidth:element.scrollWidth,
        closeRight:element.querySelector('[aria-label="关闭对话框"]')?.getBoundingClientRect().right,
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
    await page.getByRole('button',{name:'项目管理',exact:true}).click();
  }
  await page.getByRole('button',{name:'从 Forge 移除'}).first().click();
  await page.getByRole('dialog',{name:/从 Forge 移除/})
    .getByRole('button',{name:'从 Forge 移除'}).click();
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
