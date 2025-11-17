from pathlib import Path
from playwright.sync_api import sync_playwright
import json, time, os
from datetime import date
ROOT = Path(__file__).resolve().parents[1]
html=(ROOT / 'forge_glass_prototype.html').read_text(encoding='utf-8')
checks=[];errors=[]
def check(name,condition):
 checks.append({'name':name,'passed':bool(condition)});print(name, bool(condition),flush=True)
 if not condition: print('FAIL',name)
with sync_playwright() as p:
 launch_options = {'headless': True}
 # Set CHROMIUM_PATH for an existing browser; otherwise use Playwright's managed browser.
 if os.environ.get('CHROMIUM_PATH'):
  launch_options['executable_path'] = os.environ['CHROMIUM_PATH']
 b=p.chromium.launch(**launch_options)
 page=b.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
 page.set_default_timeout(4500)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html);page.wait_for_timeout(350)
 check('看板初始显示五个阶段',page.locator('.lane').count()==5)
 check('未审批的草稿不在看板中',page.locator('.task-card').filter(has_text='订单列表增加日期筛选').count()==0)
 page.get_by_role('button',name='查看并批准',exact=True).click();page.wait_for_timeout(200)
 check('打开独立审批对话框',page.locator('[role="dialog"]').count()==1)
 page.locator('#draft-title').fill('');page.locator('[data-action="approve"]').click()
 check('空标题不能被审批',page.locator('[role="dialog"]').count()==1 and '补齐' in page.locator('#notice').inner_text())
 page.locator('#draft-title').fill('订单列表增加日期筛选');page.locator('[data-action="approve"]').click();page.wait_for_timeout(150)
 check('批准后卡片进入 TODO',page.locator('.lane').first.locator('[data-task="FG-027"]').count()==1)
 check('批准不会自动进入开发',page.evaluate("tasks.find(t=>t.id==='FG-027').stage==='todo'"))
 page.locator('[data-task="FG-027"]').first.click();page.locator('[data-action="start-task"]').click()
 check('显式开始后进入开发',page.evaluate("tasks.find(t=>t.id==='FG-027').stage==='dev'"))
 page.locator('[data-action="pause-task"]').click()
 check('暂停可见状态可切换',page.evaluate("tasks.find(t=>t.id==='FG-027').paused===true"))
 page.keyboard.press('Escape');check('Escape 可关闭对话框',page.locator('[role="dialog"]').count()==0)
 page.locator('[data-task="FG-020"]').first.click();page.locator('[data-action="accept-task"]').click()
 check('未勾选人工确认不能完成任务',page.evaluate("tasks.find(t=>t.id==='FG-020').stage==='verify'"))
 page.locator('#manual-accept').check();page.locator('[data-action="accept-task"]').click()
 check('勾选后完成且不触发外部合并',page.evaluate("tasks.find(t=>t.id==='FG-020').stage==='done'"))
 page.keyboard.press('Control+k');page.locator('#task-search').fill('FG-024')
 check('快捷搜索能匹配指定卡片',page.locator('#search-results [data-task]').count()==1)
 page.keyboard.press('Escape')
 page.locator('[data-page="workflows"]').first.click();page.wait_for_timeout(200)
 page.locator('#flow-executor').select_option('Codex SDK');page.locator('[data-action="save-node"]').click()
 check('节点配置保留在原型状态',page.evaluate("state.flowExecutor==='Codex SDK'"))
 old=page.evaluate("tasks.find(t=>t.id==='FG-027').workflowVersion")
 page.locator('[data-action="publish-flow"]').click()
 check('发布新配置不修改已启动任务的流程版本',page.evaluate("tasks.find(t=>t.id==='FG-027').workflowVersion")==old)
 for target in ['agents','knowledge','projects','devices','settings','board']:
  page.evaluate(f"go('{target}')");page.wait_for_timeout(180)
  check('可渲染页面 '+target,page.locator('.page-head h1').count()==1)
 page.evaluate("go('settings')");page.wait_for_timeout(150);page.locator('[data-action="toggle-glass"]').click()
 check('减少透明度模式可切换',page.locator('body').evaluate("e=>e.classList.contains('reduce-glass')"))
 page.locator('[data-action="toggle-motion"]').click()
 check('减少动效模式可切换',page.locator('body').evaluate("e=>e.classList.contains('reduced-motion')"))
 page.evaluate("go('board')");page.wait_for_timeout(100)
 page.locator('#chat-input').fill('<img src=x onerror="alert(1)">改进列表')
 page.locator('[data-action="send"]').click();page.wait_for_timeout(100)
 check('聊天输入作为文本显示而非 HTML 执行',page.locator('img').count()==0)
 page.locator('[data-action="approve"]').click()
 check('占位验收标准不可审批',page.locator('[role="dialog"]').count()==1 and '占位验收' in page.locator('#notice').inner_text())
 page.keyboard.press('Escape')
 for width,height in [(1600,1000),(1440,900),(1280,800),(390,844)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(200)
  check(f'主窗口在 {width}×{height} 视口内',page.locator('.desktop').evaluate('(e)=>{let r=e.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}'))
 page.locator('.page-head [data-action="open-draft"]').click();page.wait_for_timeout(180)
 check('390px 下审批面板不超出窗口',page.locator('.sheet').evaluate('(e)=>{let r=e.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}'))
 check('脚本无运行异常',len(errors)==0)
 b.close()
report={'scope':'Standalone UI prototype only; simulated data; no model/Host/SDK/OS effect tests','executed_at':date.today().isoformat(),'browser':'Chromium / Playwright; HTML injected with set_content','checks':checks,'passed':sum(c['passed'] for c in checks),'total':len(checks),'runtime_errors':errors,'not_tested':['真实 macOS / Windows 原生透明材质','实际模型、执行器、Host 与插件功能','移动端真实远程配对','完整键盘/读屏审计','全部内容在任意背景上的对比度合规']}
(ROOT / 'ui-smoke-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':report['passed'],'total':report['total'],'errors':errors},ensure_ascii=False))
if report['passed']!=report['total']:raise SystemExit(1)

if report['passed'] != report['total']:
 raise SystemExit(1)
