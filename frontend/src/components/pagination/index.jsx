import React from 'react';

export default function Pagination({ page, totalPages, total, perPage, label = 'itens', onChange }) {
  if (total === 0 || totalPages <= 1) return null;

  const from = (page - 1) * perPage + 1;
  const to   = Math.min(page * perPage, total);

  const pages = buildPages(page, totalPages);

  return (
    <div className="pagination">
      <span className="pagination-info">
        {`${from}–${to} de ${total} ${label}`}
      </span>
      <div className="pagination-pages">
        <button className="pg-btn" onClick={() => onChange(page - 1)} disabled={page === 1}>←</button>
        {pages.map((p, i) =>
          p === '…'
            ? <span key={'e' + i} className="pg-ellipsis">…</span>
            : <button key={p} className={'pg-btn' + (p === page ? ' active' : '')} onClick={() => onChange(p)}>{p}</button>
        )}
        <button className="pg-btn" onClick={() => onChange(page + 1)} disabled={page === totalPages}>→</button>
      </div>
    </div>
  );
}

function buildPages(page, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  const left  = Math.max(2, page - 1);
  const right = Math.min(total - 1, page + 1);
  if (left > 2) pages.push('…');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push('…');
  pages.push(total);
  return pages;
}
