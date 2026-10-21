import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('DB/DBManager.js', () => ({
	default: {
		INTERFACE_PATH: '',
		getMessage: (id, defaultText) => (defaultText !== undefined ? defaultText : `NO MSG ${id}`)
	}
}));
vi.mock('Renderer/Renderer.js', () => ({
	default: { width: 1200, height: 800, tick: 0, render: vi.fn(), stop: vi.fn() }
}));
vi.mock('Renderer/EntityManager.js', () => ({ default: { get: vi.fn(), getOverEntity: vi.fn(), setOverEntity: vi.fn() } }));
vi.mock('Core/Client.js', () => ({
	default: {
		loadFile(_path, callback) {
			callback?.('');
		},
		loadFiles(_paths, callback) {
			callback?.('');
		}
	}
}));
vi.mock('Core/Events.js', () => ({ default: { setTimeout: vi.fn(), clearTimeout: vi.fn() } }));
const preferences = vi.hoisted(() => new Map());
vi.mock('Core/Preferences.js', () => ({
	default: {
		get: (name, defaults) => { const value = {...defaults, save: vi.fn()}; preferences.set(name,value); return value; }
	}
}));
vi.mock('Core/Configs.js', () => ({ default: { get: vi.fn() } }));
vi.mock('Controls/MouseEventHandler.js', () => ({ default: { screen: { x: 0, y: 0, width: 1200, height: 800 } } }));
vi.mock('Controls/BattleMode.js', () => ({ default: { process: vi.fn(() => false) } }));
vi.mock('Controls/ProcessCommand.js', () => ({ default: { add: vi.fn(), processCommand: vi.fn() } }));
vi.mock('UI/CursorManager.js', () => ({ default: { getActualType: () => 0, setType:vi.fn(), ACTION: {DEFAULT: 0,CLICK:2} } }));
vi.mock('UI/Elements/Elements.js', () => ({}));
vi.mock('UI/Components/ContextMenu/ContextMenu.js', () => ({
	default: { __loaded: true, remove: vi.fn(), append: vi.fn(), addElement: vi.fn() }
}));

vi.mock('Utils/Texture.js', () => ({default: {}}));
const saved = new Map();
vi.stubGlobal('localStorage', {getItem: key => saved.get(key) ?? null, setItem: (key,value) => saved.set(key,String(value)), removeItem: key => saved.delete(key)});
const ChatBox = (await import('UI/Components/ChatBox/ChatBox.js')).default;
const ChatTabStore = (await import('UI/Components/ChatBox/ChatTabStore.js')).default;
const Settings = (await import('UI/Components/ChatBoxSettings/ChatBoxSettings.js')).default;
const UIManager = (await import('UI/UIManager.js')).default;
const GUIComponent = (await import('UI/GUIComponent.js')).default;
const ScrollBar = (await import('UI/Scrollbar.js')).default;
const UIScale = (await import('UI/UIScale.js')).default;
const Cursor = (await import('UI/CursorManager.js')).default;
const Mouse = (await import('Controls/MouseEventHandler.js')).default;
const KEYS = (await import('Controls/KeyEventHandler.js')).default;
await import('UI/Components/WinPopup/WinPopup.js');
let root;
const rectangle = (left, top, width, height) => ({left,top,right:left+width,bottom:top+height,width,height,x:left,y:top});
function mouse(target,type,x,y) {
	Mouse.screen.x=x; Mouse.screen.y=y;
	const event = new MouseEvent(type,{button:0,buttons:type==='mouseup'?0:1,bubbles:true,composed:true,clientX:x,clientY:y});
	Object.defineProperty(event,'which',{value:1});
	target.dispatchEvent(event);
}

beforeEach(async () => {
	vi.useFakeTimers();
	Object.assign(preferences.get('ChatBox'), {tabs:[], tabOption:[], activeTab:0, layout:undefined});
	ChatBox.tabs=[];
	Settings.tabOption=[];
	ChatBox.__loaded=false;
	Settings.__loaded=false;
	ScrollBar.complete=true;
	ScrollBar._cssText='.ro-custom-scrollbar {position:absolute}';
	ScrollBar.skins.default={name:'default',colors:{},up:'',down:'',width:13};
	ScrollBar.skins.chatbox={...ScrollBar.skins.default,name:'chatbox',width:10};
	const original=HTMLElement.prototype.getBoundingClientRect;
	vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){
		if(this.tagName==='SPAN' && this.style.width==='max-content') return rectangle(0,0,this.textContent.length*7*(ChatBox.scale||1),15);
		return original.call(this);
	});
	ChatBox.append();
	await vi.dynamicImportSettled();
	root=ChatBox.getRoot();
	ChatBox._host.getBoundingClientRect=()=>rectangle(0,300,600,87);
	root.querySelector('.header').getBoundingClientRect=()=>rectangle(0,300,600,21);
});

afterEach(() => {
	for(const view of ChatBox.views.values()) if(view.floating) {
		view.floating.remove();
		delete UIManager.components[view.floating.name];
	}
	ChatBox.clean();
	ChatBox.remove();
	Settings.remove();
	document.body.innerHTML='';
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
	UIScale.setGlobal(1);
});

it('creates floating tabs when full and disposes frames on docking/deletion while keeping the moved log intact', async () => {
	ChatBox.setLocked(false);
	const firstCaption = ChatBox.views.get(0).caption;
	const secondCaption = ChatBox.views.get(1).caption;
	firstCaption.getBoundingClientRect = () => rectangle(0,300,50,21);
	secondCaption.getBoundingClientRect = () => rectangle(50,300,50,21);
	mouse(firstCaption.querySelector('input'),'mousedown',20,310);
	mouse(window,'mousemove',75,310);
	mouse(window,'mouseup',75,310);
	expect(ChatBox.tabStore.dockedOrder).toEqual([1,0]);
	const filler=ChatBox.addNewTab('X'.repeat(44),[ChatBox.FILTER.PUBLIC_LOG]);
	const input=root.querySelector('.input-chatbox');
	input.textContent='unfinished draft';
	root.querySelector('.battleopt2').click();
	const floatingId=ChatBox.tabStore.selectedId;
	const view=ChatBox.views.get(floatingId);
	expect(ChatBox.tabs[floatingId].location).toBe('floating');
	expect(ChatBox.activeTab).toBe(filler);
	expect(ChatBox.tabs[floatingId].filters).toEqual([ChatBox.FILTER.PUBLIC_LOG]);
	expect(ChatBox.tabs[floatingId].filters).not.toBe(ChatBox.tabs[filler].filters);
	expect(input.textContent).toBe('unfinished draft');
	view.caption.querySelector('input').focus();
	const enter = new KeyboardEvent('keydown', {key:'Enter', keyCode:13, bubbles:true});
	Object.defineProperty(enter,'which',{value:13});
	window.dispatchEvent(enter);
	expect(ChatBox.getRoot().activeElement).toBe(input);
	const component=view.floating;
	const log=view.log;
	const host=component._host;
	expect(host.style.width).toBe('320px');
	expect(host.style.height).toBe('90px');
	expect([host.style.left,host.style.top]).toEqual(['100px','100px']);
	Cursor.setType.mockClear();
	component.getRoot().querySelector('.resizer').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
	expect(Cursor.setType).toHaveBeenCalledWith(Cursor.ACTION.CLICK);
	const overlappingId=ChatBox.addNewTab('overflow '.repeat(100));
	const overlapping=ChatBox.views.get(overlappingId).floating;
	expect([overlapping._host.style.left,overlapping._host.style.top]).toEqual(['110px','120px']);
	expect(Number(overlapping._host.style.zIndex)).toBeGreaterThan(Number(host.style.zIndex));
	mouse(view.caption.querySelector('input'),'mousedown',100,200);
	mouse(window,'mouseup',100,200);
	expect(ChatBox.tabStore.selectedId).toBe(floatingId);
	expect(Number(host.style.zIndex)).toBeGreaterThan(Number(overlapping._host.style.zIndex));
	ChatBox.removeTab(overlappingId);

	ChatBox.addText('shared history',ChatBox.TYPE.PUBLIC);
	vi.advanceTimersByTime(20);
	expect(log.textContent).toContain('shared history');
	// Browser rectangles use screen pixels; scrollTop and frame sizing use logical pixels.
	UIScale.setGlobal(2);
	const message=log.querySelector('.chat-message');
	const originalLogRect=log.getBoundingClientRect;
	const originalMessageRect=message.getBoundingClientRect;
	Object.defineProperties(log,{clientHeight:{value:60,configurable:true},scrollHeight:{value:600,configurable:true}});
	log.getBoundingClientRect=()=>rectangle(0,100,640,120);
	message.getBoundingClientRect=()=>rectangle(0,100+(50+320-parseFloat(host.style.width)-log.scrollTop)*2,100,28);
	log.scrollTop=10;
	mouse(component.getRoot().querySelector('.resizer'),'mousedown',100,100);
	mouse(window,'mousemove',42,100);
	mouse(window,'mouseup',42,100);
	expect(host.style.width).toBe('291px');
	expect(log.scrollTop).toBe(39);
	log.getBoundingClientRect=originalLogRect;
	message.getBoundingClientRect=originalMessageRect;
	delete log.clientHeight;
	delete log.scrollHeight;
	log.scrollTop=0;
	UIScale.setGlobal(1);
	const position=[host.style.left,host.style.top];
	component.getRoot().querySelector('.dock').click();
	expect(view.floating).toBe(component);
	expect([host.style.left,host.style.top]).toEqual(position);
	mouse(component.getRoot().querySelector('.floating-title'),'mousedown',100,200);
	Mouse.screen.x=120;Mouse.screen.y=310;
	vi.advanceTimersByTime(20);
	mouse(window,'mouseup',120,310);
	expect(view.floating).toBe(component);
	expect(host.isConnected).toBe(true);
	root.querySelector('.wndminib').click();
	expect(ChatBox.tabs[filler]).toBeUndefined();
	component.getRoot().querySelector('.dock').click();
	expect(view.floating).toBeNull();
	expect(host.isConnected).toBe(false);
	expect(UIManager.components[component.name]).toBeUndefined();
	expect(view.log).toBe(log);
	expect(log.textContent).toContain('shared history');
	expect(input.textContent).toBe('unfinished draft');
	UIScale.setGlobal(2);
	expect(host.style.scale).toBe('');
	root.querySelector('.stickfucn').click();
	const detached=view.floating;
	expect(detached).toBeTruthy();
	const count=ChatBox.tabCount;
	detached.getRoot().querySelector('.delete').click();
	expect(ChatBox.tabCount).toBe(count-1);
	expect(UIManager.components[detached.name]).toBeUndefined();
});

it('keeps the sent-message history through a map change, and clean() empties it', () => {
	const talk=ChatBox.onRequestTalk;
	ChatBox.onRequestTalk=vi.fn();
	try {
		for(const text of ['first','second']) {
			root.querySelector('.input-chatbox').textContent=text;
			ChatBox.submit();
		}
	} finally {
		ChatBox.onRequestTalk=talk;
	}
	// A map change, a teleport on the same map included: removeComponents(), then the box again
	ChatBox.remove();
	ChatBox.append();
	const input=ChatBox.getRoot().querySelector('.input-chatbox');
	expect(input.textContent).toBe('');
	input.focus();
	const key=which=>ChatBox.onKeyDown({which,key:'',target:input,preventDefault:vi.fn(),stopImmediatePropagation:vi.fn(),getModifierState:()=>false});
	key(KEYS.UP);
	expect(input.textContent).toBe('second');
	key(KEYS.UP);
	expect(input.textContent).toBe('first');
	key(KEYS.DOWN);
	expect(input.textContent).toBe('second');
	// Exit and character select clean the box: the next character starts with no history
	ChatBox.clean();
	key(KEYS.UP);
	expect(input.textContent).toBe('');
});

it('locks main and existing floating movement through one toggle, and guards the last docked tab', () => {
	expect(ChatBox.tabStore.locked).toBe(true);
	expect(root.querySelector('.lockdragwnd').style.width).toBe('9px');
	ChatBox.setLocked(false);
	expect(root.querySelector('.lockdragwnd').style.width).toBe('15px');
	const id=ChatBox.activeTab;
	ChatBox.detachTab(id);
	const view=ChatBox.views.get(id);
	const floating=view.floating;
	const before=[floating._host.style.left,floating._host.style.top];
	root.querySelector('.lockdragwnd').click();
	mouse(floating.getRoot().querySelector('.floating-title'),'mousedown',100,100);
	Mouse.screen.x=300;Mouse.screen.y=220;
	vi.advanceTimersByTime(32);
	mouse(window,'mouseup',300,220);
	expect([floating._host.style.left,floating._host.style.top]).toEqual(before);
	expect(root.querySelector('.battleopt2').style.display).toBe('none');
	const caption=root.querySelector('.header input');
	const original=caption.value;
	const rename=name=>{caption.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));caption.value=name;caption.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));};
	rename('wide '.repeat(100));
	expect(parseFloat(caption.closest('.tab').style.width)).toBe(497);
	const count=ChatBox.tabCount;
	ChatBox.addNewTab();
	ChatBox.removeTab();
	expect(ChatBox.tabCount).toBe(count);
	expect(ChatBox.dockTab(id)).toBe(false);
	root.querySelector('.lockdragwnd').click();
	expect(parseFloat(caption.closest('.tab').style.width)).toBe(497);
	rename(original);
	expect(ChatBox.detachTab(ChatBox.activeTab)).toBe(false);
	expect(ChatBox.removeTab()).toBe(false);
	expect(ChatBox.dockTab(id)).toBe(true);
	const ordinary=new GUIComponent(floating.name,'');
	UIManager.addComponent(ordinary);
	expect(UIManager.removeComponent(floating)).toBe(false);
	expect(UIManager.components[ordinary.name]).toBe(ordinary);
	delete UIManager.components[ordinary.name];
	ChatBox.remove();
	ChatBox.__loaded=false;
	ChatBox.append();
	expect(ChatBox.tabStore.locked).toBe(false);
});

it('shows the message-table OK dialog at ten total tabs without creating another window', () => {
	ChatBox.setLocked(false);
	Mouse.intersect=true;
	const toolbar=root.querySelector('.chat-function');
	toolbar.dispatchEvent(new Event('mouseenter'));
	while(ChatBox.tabCount<10) ChatBox.addNewTab();
	root.querySelector('.battleopt2').click();
	expect(ChatBox.tabCount).toBe(10);
	const popup=document.getElementById('WinMSG');
	expect(popup.shadowRoot.querySelector('.text').textContent).toBe('Cannot add more.');
	toolbar.dispatchEvent(new Event('mouseleave'));
	expect(Mouse.intersect).toBe(false);
	const mapPress=vi.fn();
	window.addEventListener('mousedown',mapPress);
	try {
		mouse(popup.shadowRoot.querySelector('.text'),'mousedown',10,10);
		mouse(window,'mouseup',10,10);
		mouse(popup.shadowRoot.querySelector('.btn'),'mousedown',10,10);
		mouse(window,'mouseup',10,10);
		popup.shadowRoot.querySelector('.btn').click();
		expect(mapPress).not.toHaveBeenCalled();
	} finally {window.removeEventListener('mousedown',mapPress);}

	expect(popup.isConnected).toBe(false);
});

it('migrates sparse IDs and filters, then restores versioned order, floats, names and lock without overflowing the row', () => {
	ChatBox.setLocked(false);
	ChatBox.remove();
	Object.assign(preferences.get('ChatBox'), {
		layout: undefined,
		tabs: [{name:'Public'},null,null,{name:'New Tab 7'}],
		tabOption: [[0,1],null,null,[2,3]], activeTab:3
	});
	ChatBox.tabs=[];
	ChatBox.__loaded=false;
	ChatBox.append();
	expect(ChatBox.tabStore.dockedOrder).toEqual([0,3]);
	expect(ChatBox.activeTab).toBe(3);
	expect(Settings.tabOption[3]).toEqual([2,3]);
	ChatBox.setLocked(false);
	const created=ChatBox.addNewTab();
	expect(created).toBe(4);
	expect(ChatBox.tabs[created].name).toBe('New Tab 8');
	ChatBox.tabStore.reorder(4,0);
	ChatBox.detachTab(3);
	const secondFloat=ChatBox.addNewTab('Long '+ 'caption '.repeat(90));
	expect(ChatBox.tabs[secondFloat].location).toBe('floating');
	const geometry={x:77,y:91,width:400,height:200};
	Object.assign(ChatBox.views.get(3).floating._host.style,{left:'77px',top:'91px',width:'400px',height:'200px'});
	ChatBox.tabs[3].geometry=geometry;
	ChatBox.setLocked(true);
	const expected=ChatBox.tabStore.toSnapshot();
	ChatBox.remove();
	expect(preferences.get('ChatBox').layout).toEqual(expected);
	expect(JSON.stringify(expected)).not.toMatch(/chat-message|blob:|HTMLElement/);
	ChatBox.__loaded=false;
	ChatBox.append();
	expect(ChatBox.tabStore.toSnapshot()).toEqual(expected);
	expect(ChatBox.views.get(3).floating._host.style.width).toBe('400px');
	expect(Settings.tabOption[3]).toEqual([2,3]);
	// A valid saved layout can exceed today's measured row width after a font change.
	ChatBox.remove();
	const saved=preferences.get('ChatBox').layout;
	saved.tabs.find(tab=>tab.id===4).name='wide '.repeat(100);
	ChatBox.__loaded=false;
	ChatBox.append();
	expect(ChatBox.tabStore.dockedOrder).toEqual([4]);
	expect(ChatBox.tabs[0].location).toBe('floating');
	expect(ChatBox.tabCount).toBe(4);
	const sanitized=ChatTabStore.fromSaved({layout:{...saved,tabs:[
		{id:-1,name:'invalid'},
		{id:4,name:'kept',location:'floating',filters:[0],geometry:{x:NaN,y:-20,width:0,height:9999}},
		{id:4,name:'duplicate'}
	],dockedOrder:[],activeDockedId:-1,selectedId:99,nextId:0,nextNameNumber:0}});
	expect(sanitized.count).toBe(1);
	expect(sanitized.dockedOrder).toEqual([4]);
	expect(sanitized.activeDockedId).toBe(4);
	expect(sanitized.selectedId).toBe(4);
	expect(sanitized.get(4).geometry).toEqual({x:0,y:0,width:291,height:383});
	expect(sanitized.create().id).toBe(5);
	const highCounter=ChatTabStore.fromSaved({layout:{...expected,nextId:4294967294}});
	const highId=highCounter.create({name:'High ID'}).id;
	const restoredHigh=ChatTabStore.fromSaved({layout:JSON.parse(JSON.stringify(highCounter.toSnapshot()))});
	expect(restoredHigh.count).toBe(expected.tabs.length+1);
	expect(restoredHigh.get(highId).name).toBe('High ID');
	expect(restoredHigh.create().id).toBeGreaterThan(highId);

});

it('disposes manager-owned floating views and gestures on removal, keeping each log and its exports for the next append', () => {
	ChatBox.setLocked(false);
	URL.createObjectURL=vi.fn().mockReturnValueOnce('blob:displayed').mockReturnValueOnce('blob:pending');
	URL.revokeObjectURL=vi.fn();
	const id=ChatBox.activeTab;
	ChatBox.detachTab(id);
	const floating=ChatBox.views.get(id).floating;
	const oldLog=ChatBox.views.get(id).log;
	const ordinary=UIManager.addComponent(new GUIComponent('OrdinaryCleanup',''));
	ordinary.render=()=>'<div>ordinary</div>';
	ordinary.onRemove=vi.fn();
	ordinary.append();
	ChatBox.saveCurrentTabChat();
	vi.advanceTimersByTime(20);
	expect(oldLog.querySelector('a').href).toBe('blob:displayed');
	mouse(floating.getRoot().querySelector('.floating-title'),'mousedown',100,100);
	Mouse.screen.x=130;Mouse.screen.y=140;
	vi.advanceTimersByTime(20);
	expect(floating._host.style.opacity).toBe('0.7');
	const oldPosition=[floating._host.style.left,floating._host.style.top];
	const queued=[];
	const schedule=vi.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{queued.push(callback);return 987;});
	ChatBox.saveCurrentTabChat();
	ChatBox.openTabSettings(id);
	expect(()=>UIManager.removeComponents()).not.toThrow();
	expect(ordinary.onRemove).toHaveBeenCalledTimes(1);
	expect(UIManager.components.OrdinaryCleanup).toBe(ordinary);
	delete UIManager.components.OrdinaryCleanup;
	// Every map change removes the box: the log, the message still queued and
	// their exports are kept for the box that comes back
	expect(URL.revokeObjectURL).not.toHaveBeenCalled();
	expect(ChatBox.views.size).toBe(0);
	expect(UIManager.components[floating.name]).toBeUndefined();
	expect(floating._cancelDrag).toBeNull();
	expect(floating._host.style.opacity).toBe('1');
	expect(Settings.activeTab).toBeNull();
	expect(oldLog.isConnected).toBe(false);
	expect(Array.from(oldLog.querySelectorAll('a'),link=>link.href)).toEqual(['blob:displayed','blob:pending']);
	const oldScale=floating._host.style.scale;
	UIScale.setGlobal(2);
	expect(floating._host.style.scale).toBe(oldScale);
	ChatBox.append();
	const restored=ChatBox.views.get(id).floating;
	expect(restored).not.toBe(floating);
	expect(ChatBox.views.get(id).log).toBe(oldLog);
	expect(oldLog.isConnected).toBe(true);
	expect(Object.keys(UIManager.components).filter(name=>name.startsWith('ChatBox:tab:'))).toEqual([restored.name]);
	ChatBox.addText('new session',ChatBox.TYPE.PUBLIC);
	queued[0]();
	expect(ChatBox.views.get(id).log.textContent).not.toContain('new session');
	queued[1]();
	expect(ChatBox.views.get(id).log.textContent).toContain('new session');
	mouse(window,'mousemove',500,500);
	vi.advanceTimersByTime(20);
	mouse(window,'mouseup',500,500);
	expect([floating._host.style.left,floating._host.style.top]).toEqual(oldPosition);
	expect(document.querySelectorAll('[id^="ChatBox:tab:"]')).toHaveLength(1);
	schedule.mockRestore();
});
