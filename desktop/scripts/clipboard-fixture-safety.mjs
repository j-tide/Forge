/**
 * Native clipboard preservation for UI QA. Call only immediately before an
 * authorized Copy action. Importing this module reads or writes nothing.
 * Snapshots contain private clipboard contents: never log or save them.
 *
 * Only canonical Electron text/plain + optional text/html/text/rtf shapes are
 * reconstructible with clipboard.write's documented text/html/rtf fields.
 * Native aliases, standalone rich-text shapes, bookmarks, images and custom
 * formats have no verified reconstruction here and are blocked before Copy.
 */
import assert from "node:assert/strict";

export async function captureNativeClipboard(app) {
	return app.evaluate(({ clipboard }) => {
		const formats = clipboard.availableFormats();
		const supported = new Set(["text/plain", "text/html", "text/rtf"]);
		const unsupported = formats.filter((format) => !supported.has(format));
		if (formats.length && !formats.includes("text/plain"))
			unsupported.push("unverified-textual-format-shape");
		if (unsupported.length) return { formats, unsupported };
		const bookmark = clipboard.readBookmark();
		if (bookmark.url || bookmark.title)
			return { formats, unsupported: ["bookmark"] };
		return {
			formats,
			unsupported,
			text: formats.includes("text/plain") ? clipboard.readText() : undefined,
			html: formats.includes("text/html") ? clipboard.readHTML() : undefined,
			rtf: formats.includes("text/rtf") ? clipboard.readRTF() : undefined,
		};
	});
}

/** Restore and verify both format identity and every supported payload. */
export async function restoreNativeClipboard(app, snapshot) {
	assert.ok(
		snapshot &&
			Array.isArray(snapshot.unsupported) &&
			snapshot.unsupported.length === 0,
		"Unsupported native clipboard contents must never be overwritten",
	);
	const restored = await app.evaluate(({ clipboard }, saved) => {
		clipboard.clear();
		const value = {};
		if (saved.formats.includes("text/plain")) value.text = saved.text;
		if (saved.formats.includes("text/html")) value.html = saved.html;
		if (saved.formats.includes("text/rtf")) value.rtf = saved.rtf;
		if (Object.keys(value).length) clipboard.write(value);
		return {
			formats:
				JSON.stringify(clipboard.availableFormats().sort()) ===
				JSON.stringify([...saved.formats].sort()),
			text: value.text === undefined || clipboard.readText() === saved.text,
			html: value.html === undefined || clipboard.readHTML() === saved.html,
			rtf: value.rtf === undefined || clipboard.readRTF() === saved.rtf,
		};
	}, snapshot);
	assert.ok(
		Object.values(restored).every(Boolean),
		"Native clipboard format or content restoration verification failed",
	);
}
