import { useLayoutEffect, useState } from "react";

/** Measure the actual app scrollport, never an assumed phone/nav height. */
export function useStackGeometry(ref, openId, rowKey) {
  const [geometry, setGeometry] = useState({ availableHeight: 0, detailHeight: 0 });
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const main = list.closest("main") || document.documentElement;
    const measure = () => {
      const bounds = main.getBoundingClientRect();
      const viewportBottom = window.visualViewport
        ? window.visualViewport.height + window.visualViewport.offsetTop
        : window.innerHeight;
      // Add scrollTop to obtain the list's stable position in the scrollport;
      // scrolling must not continuously push the stack further down the page.
      const listTop = list.getBoundingClientRect().top + main.scrollTop;
      const availableHeight = Math.max(0, Math.min(bounds.bottom, viewportBottom) - listTop - 16);
      const openCard = [...list.children].find((el) => el.dataset.bookingId === openId);
      const detailHeight = openCard?.querySelector("[data-stack-details]")?.getBoundingClientRect().height || 0;
      setGeometry((old) => old.availableHeight === availableHeight && old.detailHeight === detailHeight
        ? old : { availableHeight, detailHeight });
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(main);
    // Ancestor sizes catch header/notice changes before the stack as well.
    for (let node = list.parentElement; node && node !== main; node = node.parentElement) observer?.observe(node);
    list.querySelectorAll("[data-stack-details]").forEach((node) => observer?.observe(node));
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [ref, openId, rowKey]);
  return geometry;
}
