(() => {
  'use strict';
  // Divide the existing page into near-equal rows. No reordered or cloned cards.
  function balancedRows(count, width) {
    const columns = Math.max(1, Math.floor((width + 20) / 180));
    const rows = Math.max(1, Math.ceil(count / columns));
    return Array.from({length: rows}, (_, i) => Math.floor(count / rows) + (i < count % rows ? 1 : 0));
  }
  const originalLayout = new WeakMap();
  let pending = false;
  function update() {
    pending = false;
    document.querySelectorAll('.itemsContainer.vertical-wrap').forEach(grid => {
      const cards = [...grid.children];
      const eligible = window.innerWidth >= 1000 && grid.closest('.libraryPage') && !grid.closest('.homePage,.detailPage') && cards.length && cards.every(card => card.matches('.card.portraitCard'));
      if (!eligible) {
        grid.classList.remove('noctra-balanced-library');
        const previous = originalLayout.get(grid);
        if (previous) { for (const [name, value, priority] of previous) value ? grid.style.setProperty(name, value, priority) : grid.style.removeProperty(name); originalLayout.delete(grid); }
        cards.forEach(card => card.style.removeProperty('--noctra-poster-width'));
        return;
      }
      const style = getComputedStyle(grid);
      const width = grid.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0);
      if (width <= 0) return;
      grid.classList.add('noctra-balanced-library');
      const layout = {'display':'flex','flex-wrap':'wrap','gap':'24px 20px','justify-content':'flex-start'};
      if (!originalLayout.has(grid)) originalLayout.set(grid, Object.keys(layout).map(name => [name, grid.style.getPropertyValue(name), grid.style.getPropertyPriority(name)]));
      for (const [name,value] of Object.entries(layout)) grid.style.setProperty(name,value,'important');
      let index = 0;
      balancedRows(cards.length, width).forEach(count => {
        const value = `calc((100% - ${(count - 1) * 20}px) / ${count})`;
        for (let i = 0; i < count; i++) {
          const card = cards[index++];
          if (card.style.getPropertyValue('--noctra-poster-width') !== value) card.style.setProperty('--noctra-poster-width', value);
        }
      });
    });
  }
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(update); } }
  new MutationObserver(schedule).observe(document.body, {childList:true,subtree:true});
  window.addEventListener('resize', schedule, {passive:true});
  window.addEventListener('hashchange', schedule);
  schedule();
})();
