import { useLayoutEffect, useRef } from 'react';

interface HeroDesignProps {
  /** Raw HTML of the exported design (imported with `?raw`). */
  html: string;
  /** Canvas size the design was exported at. */
  width: number;
  height: number;
  /** 'cover' fills the hero and crops the overflow, 'contain' shows the whole canvas. */
  fit?: 'cover' | 'contain';
  /**
   * Wrap the name layers in `.title-group` and the testimonial layers in
   * `.testimonial-group` so they can be animated as two blocks.
   * Only the desktop export uses these ids — leave it off for mobile.
   */
  group?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The exported designs are fixed-size canvases (e.g. 4591x2350) made of absolutely
 * positioned text/image layers. This wrapper centres that canvas and scales it with a
 * CSS transform so it lines up with the hero photo behind it, at any viewport size.
 *
 * It also exposes the live scale factor as `--hero-scale`, which lets CSS move layers
 * *inside* the canvas by screen pixels: `translate(calc(var(--x) / var(--hero-scale)))`.
 */
export function HeroDesign({ html, width, height, fit = 'cover', group = false, className = '', style }: HeroDesignProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;

    const page = canvas.querySelector<HTMLElement>('.page');

    // The export hard-codes `overflow: hidden` on .page, which clips at canvas
    // coords 0..2350. The morph moves layers well outside that box (the title
    // ends up around y = -1300 at tablet width), so the clip has to go.
    // Nothing is lost: .hero-design still clips everything to the viewport.
    if (group && page) page.style.overflow = 'visible';

    if (group && page && !page.querySelector('.title-group')) {
      const titleIds = new Set(['text_2', 'text_3']);
      // Each testimonial = adjective + name + role + star image, as its own group
      const testimonialGroups: Array<{ className: string; ids: string[] }> = [
        { className: 'testimonial-group testimonial-1', ids: ['text_4', 'text_19', 'text_22', 'image_31'] },
        { className: 'testimonial-group testimonial-2', ids: ['text_5', 'text_20', 'text_24', 'image_30'] },
        { className: 'testimonial-group testimonial-3', ids: ['text_6', 'text_21', 'text_18', 'image_29'] },
        { className: 'testimonial-group testimonial-4', ids: ['text_7', 'text_13', 'text_17', 'image_27'] },
        { className: 'testimonial-group testimonial-5', ids: ['text_8', 'text_11', 'text_15', 'image_25'] },
        { className: 'testimonial-group testimonial-6', ids: ['text_9', 'text_12', 'text_16', 'image_26'] },
        { className: 'testimonial-group testimonial-7', ids: ['text_10', 'text_14', 'text_23', 'image_28'] },
      ];
      const pageChildren = Array.from(page.children) as HTMLElement[];
      const moveIntoGroup = (ids: Set<string> | string[], className: string) => {
        const idSet = ids instanceof Set ? ids : new Set(ids);
        const members = pageChildren.filter((child) => idSet.has(child.id));
        if (members.length === 0) return;
        const g = document.createElement('div');
        g.className = className;
        g.style.position = 'absolute';
        g.style.inset = '0';
        g.style.pointerEvents = 'none';
        members[0].before(g);
        members.forEach((member) => g.appendChild(member));
      };

      moveIntoGroup(titleIds, 'title-group');
      testimonialGroups.forEach((tg) => moveIntoGroup(tg.ids, tg.className));

      // For each testimonial, compute the bounding box of just the text
      // layers (the adjective + name + role — NOT the star image), then
      // create a hover trigger sized to that text area only.  The trigger
      // drives a JS-controlled shine class so the animation always restarts
      // cleanly and never gets stuck.
      testimonialGroups.forEach((tg) => {
        const groupEl = page.querySelector(`.${tg.className.split(' ')[1]}`) as HTMLElement | null;
        if (!groupEl) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        Array.from(groupEl.children).forEach((child) => {
          const el = child as HTMLElement;
          // Skip image layers — shine applies to text only
          if (el.id.startsWith('image_')) return;
          const left = parseFloat(el.style.left) || 0;
          const top = parseFloat(el.style.top) || 0;
          const w = parseFloat(el.style.width) || 0;
          const h = parseFloat(el.style.height) || 0;
          minX = Math.min(minX, left);
          minY = Math.min(minY, top);
          maxX = Math.max(maxX, left + w);
          maxY = Math.max(maxY, top + h);
        });
        if (minX === Infinity) return;

        const pad = 30;
        const bx = minX - pad;
        const by = minY - pad;
        const bw = maxX - minX + pad * 2;
        const bh = maxY - minY + pad * 2;

        groupEl.style.setProperty('--shine-x', `${bx}px`);
        groupEl.style.setProperty('--shine-y', `${by}px`);
        groupEl.style.setProperty('--shine-w', `${bw}px`);
        groupEl.style.setProperty('--shine-h', `${bh}px`);

        const trigger = document.createElement('div');
        trigger.className = 'shine-trigger';
        trigger.style.cssText = `position:absolute;left:${bx}px;top:${by}px;width:${bw}px;height:${bh}px;pointer-events:auto;cursor:pointer;z-index:99;`;

        // JS-driven hover: toggling the class off then on forces the
        // browser to restart the keyframe animation from scratch every
        // time, so it never freezes mid-shine.
        trigger.addEventListener('mouseenter', () => {
          groupEl.classList.remove('shine-active');
          void groupEl.offsetWidth; // force reflow → restart animation
          groupEl.classList.add('shine-active');
        });
        trigger.addEventListener('mouseleave', () => {
          groupEl.classList.remove('shine-active');
        });

        groupEl.appendChild(trigger);
      });
    }

    const resize = () => {
      const w = box.clientWidth || window.innerWidth;
      const h = box.clientHeight || window.innerHeight;
      const scale = fit === 'cover'
        ? Math.max(w / width, h / height)
        : Math.min(w / width, h / height);
      canvas.style.transform = `translate(-50%, -50%) scale(${scale})`;
      // let the grouped layers convert screen px -> canvas px
      canvas.style.setProperty('--hero-scale', String(scale));
    };

    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(box);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
    };
  }, [width, height, fit, group]);

  return (
    <div
      ref={boxRef}
      className={`hero-design ${className}`}
      style={{ overflow: 'hidden', pointerEvents: 'none', ...style }}
    >
      <div
        ref={canvasRef}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width,
          height,
          transformOrigin: 'center center',
          transform: `translate(-50%, -50%) scale(${typeof window !== 'undefined' ? Math.max(window.innerWidth / width, window.innerHeight / height) : 1})`,
          willChange: 'transform',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
