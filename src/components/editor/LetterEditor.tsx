import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { Placeholder, CharacterCount } from '@tiptap/extensions';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Baseline,
  List,
  ListOrdered,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  TextAlignJustify,
  Undo2,
  Redo2,
  RemoveFormatting,
  ChevronDown,
  Link2,
  Quote,
  Minus,
  Palette,
  Maximize2,
  X,
  Check,
} from 'lucide-react';
import { persianFonts } from '@/services/pdfExport';
import { looksLikeHtml, plainTextToHtml, sanitizeLetterHtml } from '@/lib/richtext';

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px'];
const LINE_HEIGHTS = ['1.5', '1.75', '2', '2.5', '3'];
const TEXT_COLORS = [
  { value: '#0f172a', name: 'سرمه‌ای' },
  { value: '#334155', name: 'طوسی تیره' },
  { value: '#dc2626', name: 'قرمز' },
  { value: '#d97706', name: 'کهربایی' },
  { value: '#16a34a', name: 'سبز' },
  { value: '#2563eb', name: 'آبی' },
  { value: '#7c3aed', name: 'بنفش' },
  { value: '#000000', name: 'مشکی' },
];
const HIGHLIGHT_COLORS = [
  { value: '#fde68a', name: 'زرد' },
  { value: '#bbf7d0', name: 'سبز' },
  { value: '#bfdbfe', name: 'آبی' },
  { value: '#fbcfe8', name: 'صورتی' },
  { value: '#fed7aa', name: 'نارنجی' },
  { value: '#ddd6fe', name: 'بنفش' },
  { value: '#e2e8f0', name: 'خاکستری' },
];

/** Normalizes any stored body (HTML or legacy plain text) into editor HTML. */
const toEditorHtml = (value: string): string =>
  looksLikeHtml(value) ? sanitizeLetterHtml(value) : plainTextToHtml(value);

interface TButtonProps {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}

/** Toolbar icon button. Selection in the editor is preserved via onMouseDown. */
function TButton({ active, disabled, title, onClick, children }: TButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      // Keep the editor selection: don't move focus away on press.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors touch-manipulation disabled:opacity-35 sm:h-8 sm:w-8 ${
        active
          ? 'bg-indigo-100 text-indigo-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-200 sm:mx-1" />;

// The four dropdowns carry the widest labels ("فونت پیش‌فرض", "اندازه‌ی فونت").
// Inline they keep generous minimums because they sit in a scrollable row.
// In fullscreen they must shrink and share the row, otherwise they alone fill a
// line and push the tool rows down until the text area has no room left.
const selectClass =
  'h-10 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-slate-700 touch-manipulation focus:outline-none focus:border-indigo-300 sm:h-8 sm:text-xs';
const fullscreenSelectClass =
  'h-10 min-w-0 flex-1 basis-[6.5rem] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 touch-manipulation focus:outline-none focus:border-indigo-300';

interface LetterEditorProps {
  /** Letter body — HTML (rich format) or legacy plain text. */
  value: string;
  /** Called with the HTML body on every change. */
  onChange: (html: string) => void;
  /**
   * Open straight into fullscreen (focus) mode.
   *
   * The Preview page passes true when the user taps «ویرایش»: on a phone the
   * editor needs every pixel it can get, and a half-screen editor inside a
   * scrollable page is the worst place to write a letter.
   */
  startFullscreen?: boolean;
  /** Confirms the edits and leaves the editor. Renders in the fullscreen header. */
  onConfirm?: () => void;
  /** Discards the edits and leaves the editor. Renders in the fullscreen header. */
  onCancel?: () => void;
  /** Label shown in the fullscreen header. */
  fullscreenTitle?: string;
}

/**
 * Professional RTL rich-text editor for letter bodies.
 * Formatting (font family/size, styles, alignment, lists, color, links,
 * spacing) is stored as HTML inside the existing `content` column.
 *
 * Mobile: single-row horizontally scrollable toolbar with 40px touch
 * targets; color palettes render as a panel row below the toolbar so they
 * are never clipped by the scroll container. Fullscreen (focus) mode uses
 * a class toggle on the same DOM node, so the editor is never remounted.
 */
export function LetterEditor({
  value,
  onChange,
  startFullscreen = false,
  onConfirm,
  onCancel,
  fullscreenTitle = 'ویرایش مکتوب',
}: LetterEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [showColors, setShowColors] = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(startFullscreen);
  const [counts, setCounts] = useState({ chars: 0, words: 0 });

  // Last HTML emitted to (or received from) the parent — used to avoid
  // re-setting editor content when the value we just emitted flows back.
  const lastEmittedRef = useRef(toEditorHtml(value));

  const updateCounts = (e: { getText(): string; storage: unknown }) => {
    const st = (
      e.storage as Record<string, { characters(): number; words(): number } | undefined>
    ).characterCount;
    const text = e.getText();
    setCounts({
      chars: st ? st.characters() : text.length,
      words: st ? st.words() : text.split(/\s+/).filter(Boolean).length,
    });
  };
  const editor = useEditor({
    immediatelyRender: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Link ships with StarterKit in TipTap v3 — no extra dependency.
        link: { openOnClick: false, autolink: true },
      }),
      TextStyleKit,
      TextAlign.configure({ types: ['paragraph', 'heading'], defaultAlignment: 'right' }),
      Highlight.configure({ multicolor: true }),
      CharacterCount,
      Placeholder.configure({ placeholder: 'متن مکتوب را اینجا بنویسید…' }),
    ],
    content: lastEmittedRef.current,
    editorProps: {
      attributes: {
        dir: 'rtl',
        class: 'kateb-editor-content',
      },
    },
    onCreate: ({ editor: e }) => updateCounts(e),
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      lastEmittedRef.current = html;
      onChangeRef.current(html);
      updateCounts(e);
    },
  });

  // Sync when the value changes from outside (e.g. another letter loaded).
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedRef.current) return;
    const html = toEditorHtml(value);
    lastEmittedRef.current = html;
    editor.commands.setContent(html, { emitUpdate: false });
    updateCounts(editor);
  }, [editor, value]);

  // Fullscreen (focus) mode: lock page scroll and allow Esc to exit.
  useEffect(() => {
    if (!isFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isFullscreen]);

  const t = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      const textStyle = e.getAttributes('textStyle') as {
        fontFamily?: string;
        fontSize?: string;
        lineHeight?: string;
        color?: string;
      };
      return {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        highlight: e.isActive('highlight'),
        h1: e.isActive('heading', { level: 1 }),
        h2: e.isActive('heading', { level: 2 }),
        h3: e.isActive('heading', { level: 3 }),
        paragraph: e.isActive('paragraph'),
        alignRight: e.isActive('textAlign', { alignment: 'right' }),
        alignCenter: e.isActive('textAlign', { alignment: 'center' }),
        alignLeft: e.isActive('textAlign', { alignment: 'left' }),
        alignJustify: e.isActive('textAlign', { alignment: 'justify' }),
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        blockquote: e.isActive('blockquote'),
        link: e.isActive('link'),
        fontFamily: textStyle.fontFamily ?? '',
        fontSize: textStyle.fontSize ?? '',
        lineHeight: textStyle.lineHeight ?? '',
        color: textStyle.color ?? '',
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });
  if (!editor || !t) return null;

  const headingValue = t.h1 ? '1' : t.h2 ? '2' : t.h3 ? '3' : 'p';

  const handleLink = () => {
    if (t.link) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const current = editor.getAttributes('link').href as string | undefined;
    const input = window.prompt(
      'آدرس لینک را وارد کنید (مثلاً https://example.com):',
      current ?? 'https://',
    );
    if (input === null) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    const href = /^(https?:\/\/|mailto:|tel:)/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };

  return (
    <div
      className={
        isFullscreen
          ? // z-[60] so the editor covers the mobile header (z-30), the bottom nav
            // (z-40) and the upgrade modal (z-50) — a full-page editor that leaves
            // navigation reachable behind it is not full page.
            'kateb-editor kateb-editor-full fixed inset-0 z-[60] flex flex-col bg-white'
          : 'kateb-editor overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm focus-within:border-indigo-300'
      }
    >
      {/* Fullscreen header: the only way out of an editor that covers the whole
          screen. Confirm / cancel live here because the Preview page toolbar is
          behind the overlay and unreachable. */}
      {isFullscreen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200/80 bg-slate-50 px-2 py-2">
          <button
            type="button"
            onClick={() => setIsFullscreen(false)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 touch-manipulation"
            aria-label="بستن حالت تمام‌صفحه"
            title="بستن (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">
            {fullscreenTitle}
          </span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="h-10 shrink-0 rounded-xl px-3 text-sm font-semibold text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 touch-manipulation"
            >
              لغو
            </button>
          )}
          {onConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-700 touch-manipulation"
            >
              <Check className="h-4 w-4" />
              <span>تأیید</span>
            </button>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="kateb-toolbar shrink-0 border-b border-slate-200/80 bg-slate-50/90">
        {/*
          INLINE: one horizontally scrollable row — compact, but the user has to
          swipe to reach the right-hand tools.

          FULLSCREEN: the same tools wrap onto as many rows as they need. Nothing
          scrolls sideways, so every control is visible at once, which is the whole
          point of going full page on a phone.
        */}
        <div
          className={
            isFullscreen
              ? 'flex flex-wrap items-center gap-x-1 gap-y-1.5 px-2 py-2'
              : 'flex items-center gap-0.5 overflow-x-auto no-scrollbar px-1.5 py-1.5 touch-manipulation sm:flex-wrap sm:gap-1 sm:overflow-x-visible sm:px-2 sm:py-2'
          }
        >
          <TButton
            title="بازگردانی (Ctrl+Z)"
            disabled={!t.canUndo}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 className="h-4 w-4" />
          </TButton>
          <TButton
            title="بازانجام (Ctrl+Y)"
            disabled={!t.canRedo}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 className="h-4 w-4" />
          </TButton>

          <Divider />

          {/* Heading / paragraph */}
          <select
            title="نوع بلوک"
            aria-label="نوع بلوک"
            className={isFullscreen ? fullscreenSelectClass : selectClass}
            style={isFullscreen ? undefined : { minWidth: '5.5rem' }}
            value={headingValue}
            onChange={(ev) => {
              const v = ev.target.value;
              if (v === 'p') editor.chain().focus().setParagraph().run();
              else editor.chain().focus().toggleHeading({ level: Number(v) as 1 | 2 | 3 }).run();
            }}
          >
            <option value="p">پاراگراف</option>
            <option value="1">تیتر ۱</option>
            <option value="2">تیتر ۲</option>
            <option value="3">تیتر ۳</option>
          </select>

          {/* Font family */}
          <select
            title="نوع فونت"
            aria-label="نوع فونت"
            className={isFullscreen ? fullscreenSelectClass : selectClass}
            style={
              isFullscreen
                ? undefined
                : {
                    fontFamily: t.fontFamily || undefined,
                    minWidth: '6.5rem',
                    maxWidth: '7.5rem',
                  }
            }
            value={persianFonts.some((f) => f.cssFamily === t.fontFamily) ? t.fontFamily : ''}
            onChange={(ev) => {
              const v = ev.target.value;
              if (v) editor.chain().focus().setFontFamily(v).run();
              else editor.chain().focus().unsetFontFamily().run();
            }}
          >
            <option value="">فونت پیش‌فرض</option>
            {persianFonts.map((f) => (
              <option key={f.id} value={f.cssFamily} style={{ fontFamily: f.cssFamily }}>
                {f.name}
              </option>
            ))}
          </select>

          {/* Font size */}
          <select
            title="اندازه‌ی فونت"
            aria-label="اندازه‌ی فونت"
            className={isFullscreen ? fullscreenSelectClass : selectClass}
            style={isFullscreen ? undefined : { minWidth: '4.5rem' }}
            value={FONT_SIZES.includes(t.fontSize) ? t.fontSize : ''}
            onChange={(ev) => {
              const v = ev.target.value;
              if (v) editor.chain().focus().setFontSize(v).run();
              else editor.chain().focus().unsetFontSize().run();
            }}
          >
            <option value="">اندازه</option>
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s.replace('px', '')}
              </option>
            ))}
          </select>

          {/* Line height */}
          <select
            title="فاصله‌ی خطوط"
            aria-label="فاصله‌ی خطوط"
            className={isFullscreen ? fullscreenSelectClass : selectClass}
            style={isFullscreen ? undefined : { minWidth: '5rem' }}
            value={LINE_HEIGHTS.includes(t.lineHeight) ? t.lineHeight : ''}
            onChange={(ev) => {
              const v = ev.target.value;
              if (v) editor.chain().focus().setLineHeight(v).run();
              else editor.chain().focus().unsetLineHeight().run();
            }}
          >
            <option value="">فاصله خط</option>
            {LINE_HEIGHTS.map((lh) => (
              <option key={lh} value={lh}>
                {lh}
              </option>
            ))}
          </select>

          <Divider />

          {/* Text styles */}
          <TButton
            title="بولد (Ctrl+B)"
            active={t.bold}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-4 w-4" strokeWidth={2.6} />
          </TButton>
          <TButton
            title="ایتالیک (Ctrl+I)"
            active={t.italic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-4 w-4" />
          </TButton>
          <TButton
            title="زیرخط (Ctrl+U)"
            active={t.underline}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <Underline className="h-4 w-4" />
          </TButton>
          <TButton
            title="خط‌خوردگی"
            active={t.strike}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="h-4 w-4" />
          </TButton>
          <TButton
            title="هایلایت"
            active={t.highlight}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
          >
            <Highlighter className="h-4 w-4 text-amber-500" />
          </TButton>
          <TButton
            title="رنگ هایلایت"
            active={showHighlights}
            onClick={() => {
              setShowHighlights((v) => !v);
              setShowColors(false);
            }}
          >
            <Palette className="h-4 w-4 text-amber-500" />
          </TButton>

          {/* Text color */}
          <TButton
            title="رنگ متن"
            active={showColors}
            onClick={() => {
              setShowColors((v) => !v);
              setShowHighlights(false);
            }}
          >
            <span className="flex items-center">
              <Baseline className="h-4 w-4" style={{ color: t.color || '#0f172a' }} />
              <ChevronDown className="h-3 w-3" />
            </span>
          </TButton>

          <Divider />

          {/* Alignment — icons are physically oriented (End = right side) */}
          <TButton
            title="تراز راست"
            active={t.alignRight}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
          >
            <TextAlignEnd className="h-4 w-4" />
          </TButton>
          <TButton
            title="تراز وسط"
            active={t.alignCenter}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
          >
            <TextAlignCenter className="h-4 w-4" />
          </TButton>
          <TButton
            title="تراز چپ"
            active={t.alignLeft}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
          >
            <TextAlignStart className="h-4 w-4" />
          </TButton>
          <TButton
            title="تراز کامل"
            active={t.alignJustify}
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          >
            <TextAlignJustify className="h-4 w-4" />
          </TButton>

          <Divider />

          {/* Lists */}
          <TButton
            title="لیست نقطه‌ای"
            active={t.bulletList}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-4 w-4" />
          </TButton>
          <TButton
            title="لیست شماره‌دار"
            active={t.orderedList}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-4 w-4" />
          </TButton>
          <TButton
            title="نقل‌قول"
            active={t.blockquote}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote className="h-4 w-4" />
          </TButton>
          <TButton
            title="خط افقی"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <Minus className="h-4 w-4" />
          </TButton>

          <Divider />

          {/* Link */}
          <TButton title="لینک" active={t.link} onClick={handleLink}>
            <Link2 className="h-4 w-4" />
          </TButton>

          <TButton
            title="پاک‌سازی فرمت"
            onClick={() =>
              editor
                .chain()
                .focus()
                .unsetAllMarks()
                .clearNodes()
                .setParagraph()
                .unsetColor()
                .unsetFontFamily()
                .unsetFontSize()
                .unsetLineHeight()
                .run()
            }
          >
            <RemoveFormatting className="h-4 w-4" />
          </TButton>

          <Divider />

          {/* Word / character counter */}
          <span className="shrink-0 select-none px-1 text-[11px] tabular-nums text-slate-400">
            {counts.words.toLocaleString('fa-IR')} واژه · {counts.chars.toLocaleString('fa-IR')}{' '}
            نویسه
          </span>

          {/* Fullscreen (focus) mode. Hidden in fullscreen — the header's X button
              is the way out, and a "leave fullscreen" button inside the very
              toolbar the user is reading is just noise. */}
          {!isFullscreen && (
            <TButton
              title="تمام‌صفحه"
              onClick={() => setIsFullscreen(true)}
            >
              <Maximize2 className="h-4 w-4" />
            </TButton>
          )}
        </div>

        {/* Color panel — rendered as a row below the scrollable toolbar so
            it can never be clipped by overflow-x on mobile. */}
        {showColors && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200/80 bg-white px-2 py-2">
            <span className="text-[11px] text-slate-500">رنگ متن:</span>
            {TEXT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.name}
                aria-label={`رنگ ${c.name}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().setColor(c.value).run();
                  setShowColors(false);
                }}
                className="h-7 w-7 rounded-md border border-slate-200 transition-transform touch-manipulation hover:scale-110"
                style={{ backgroundColor: c.value }}
              />
            ))}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().unsetColor().run();
                setShowColors(false);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 touch-manipulation hover:bg-slate-50"
            >
              حذف رنگ
            </button>
            <button
              type="button"
              onClick={() => setShowColors(false)}
              className="ms-auto rounded-lg px-2 py-1 text-[11px] text-slate-400 touch-manipulation hover:bg-slate-50 hover:text-slate-600"
            >
              بستن ✕
            </button>
          </div>
        )}

        {showHighlights && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200/80 bg-white px-2 py-2">
            <span className="text-[11px] text-slate-500">هایلایت:</span>
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.name}
                aria-label={`هایلایت ${c.name}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().toggleHighlight({ color: c.value }).run();
                  setShowHighlights(false);
                }}
                className="h-7 w-7 rounded-md border border-slate-200 transition-transform touch-manipulation hover:scale-110"
                style={{ backgroundColor: c.value }}
              />
            ))}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().unsetHighlight().run();
                setShowHighlights(false);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 touch-manipulation hover:bg-slate-50"
            >
              حذف هایلایت
            </button>
            <button
              type="button"
              onClick={() => setShowHighlights(false)}
              className="ms-auto rounded-lg px-2 py-1 text-[11px] text-slate-400 touch-manipulation hover:bg-slate-50 hover:text-slate-600"
            >
              بستن ✕
            </button>
          </div>
        )}
      </div>

      {/* Editor surface */}
      <div
        className={
          isFullscreen
            ? // min-h-0 lets this flex child actually shrink; without it a long
              // toolbar (which now wraps onto several rows) would push the text
              // area off the bottom of the screen instead of scrolling.
              'kateb-editor-scroll overscroll-contain min-h-0 flex-1 overflow-y-auto px-4 py-4'
            : 'px-3 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4'
        }
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}





