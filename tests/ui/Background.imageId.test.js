import { beforeEach, expect, it, vi } from 'vitest';

// A background image that finishes loading after another background (or its
// removal) has been asked for must not paint over it.

const { animations, loadFile } = vi.hoisted(() => ({ animations: [], loadFile: vi.fn() }));
vi.mock('DB/DBManager.js', () => ({ default: { INTERFACE_PATH: '' } }));
vi.mock('Core/Client.js', () => ({ default: { loadFile } }));
vi.mock('Core/Configs.js', () => ({ default: { get: () => 10 } }));
vi.mock('Network/PacketVerManager.js', () => ({ default: { value: 20120410 } }));
vi.mock('Utils/HtmlHelper.js', () => ({
 animateElement: (_element, _props, _duration, done) => {
  animations.push(done);
  return { stop() {} };
 }
}));

beforeEach(() => {
 vi.resetModules();
 loadFile.mockImplementation((_path, done) => done('data:image/bmp;base64,AA=='));
 animations.length = 0;
 document.body.innerHTML = '';
 vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect() {} });
});

it('keeps the login background when an earlier map fade finishes', async () => {
 const { default: Background } = await import('UI/Background.js');
 Background.setImage('loading01.jpg');
 animations.shift()();
 animations.shift()();
 const background = [...document.body.children].find(el => el.tagName === 'DIV');
 const done = vi.fn();
 Background.remove(done);
 Background.setLoginBackground();
 const loginImage = background.style.backgroundImage;
 animations.shift()();
 expect(done).toHaveBeenCalledOnce();
 expect(background.parentNode).toBe(document.body);
 expect(background.style.backgroundImage).toBe(loginImage);
 expect(loginImage).not.toBe('none');
});

it('ignores an old loading image that arrives after the login background', async () => {
 const { default: Background } = await import('UI/Background.js');
 Background.setLoginBackground();
 animations.shift()();
 animations.shift()();
 const background = [...document.body.children].find(el => el.tagName === 'DIV');
 let finishOldImage;
 loadFile.mockImplementationOnce((_path, done) => { finishOldImage = done; });
 const loadingDone = vi.fn();
 Background.setImage('loading01.jpg', loadingDone);
 Background.setLoginBackground();
 const loginImage = background.style.backgroundImage;
 finishOldImage('data:image/bmp;base64,AQ==');
 expect(background.style.backgroundImage).toBe(loginImage);
 expect(loadingDone).not.toHaveBeenCalled();
});
