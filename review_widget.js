/* 스윗스위치 상품후기 위젯
 *
 * 카페24 상품 상세 페이지의 기본 상품후기 목록을 네이버 스마트스토어 모양으로 다시 그린다.
 * 게시판 데이터는 건드리지 않는다. 화면만 바꾼다.
 *
 * 넣는 법: 스크립트태그 API 로 상품 상세 화면에만 설치 (또는 SEO 코드 입력란).
 * 데이터  : DATA_BASE + 'reviews_{카페24상품번호}.js'  (build_widget_data.py 가 만든다)
 *           카페24 파일업로더가 이미지·HTML/CSS/JS·웹폰트만 받아서 .json 이 아니라 .js 로 올린다.
 *           그 파일은 window.__SW_REVIEWS__[상품번호] 에 데이터를 넣어 둔다.
 *
 * 규칙
 *  - 상품 상세가 아니면 아무것도 하지 않고 즉시 빠진다.
 *  - 데이터를 제대로 받은 뒤에만 기본 게시판을 가린다. 실패하면 기본 게시판이 그대로 보인다.
 *  - 기본 게시판은 DOM 에 남겨 둔다 (검색 노출용). 화면에서만 가린다.
 *  - '후기 쓰기' 버튼은 기본 게시판 것을 그대로 가져와 쓴다.
 */
(function () {
  'use strict';

  // 파일업로더에 올린 파일은 카페24 이미지 서버로 서비스된다 (쇼핑몰 도메인이 아니다).
  var DATA_BASE = 'https://ecimg.cafe24img.com/pg1998b72030422016/sweetswitch12/review/';
  var PAGE = 10;                              // 팝업에서 한 번에 보여줄 수
  var HEAD = 3;                               // 상품 페이지에 미리 보여줄 수
  var STRIP = 5;                              // 사진 스트립 장수
  var NOTICE = '네이버 스마트스토어에서 옮겨온 구매 후기가 포함되어 있습니다.';

  var state = { data: null, filter: 'all', sort: 'new', shown: PAGE };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function stars(n) { return Array(n + 1).join('★'); }
  function fmtDate(d) { return d.slice(2, 4) + '.' + d.slice(5, 7) + '.' + d.slice(8, 10) + '.'; }

  /* 이 페이지가 상품 상세인지, 후기 영역이 어디인지 */
  function findBoard() {
    if (location.pathname.indexOf('/product/detail.html') === -1 &&
        !/\/product\//.test(location.pathname)) return null;
    return document.getElementById('prdReview') ||
           $('.xans-product-review') ||
           $('[id*="prdReview"]');
  }

  function productNo() {
    var m = location.search.match(/[?&]product_no=(\d+)/);
    if (m) return m[1];
    var input = $('input[name="product_no"]');
    return input ? input.value : null;
  }

  function css() {
    return '' +
    '#swReview{font:14px/1.6 -apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#222;text-align:left}' +
    '#swReview *{box-sizing:border-box}' +
    '#swReview .sw-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}' +
    '#swReview .sw-head h3{font-size:19px;margin:0}' +
    '#swReview .sw-std{font-size:12px;color:#8e8e8e}' +
    '#swReview .sw-score{display:flex;align-items:center;gap:8px;font-size:13px;color:#8e8e8e}' +
    '#swReview .sw-score b{font-size:20px;color:#222}' +
    '#swReview .sw-score .sw-star{color:#ff4757;font-size:18px}' +
    '#swReview .sw-notice{margin:12px 0 18px;padding:9px 12px;background:#f7f8fa;border-radius:6px;font-size:12px;color:#555}' +
    '#swReview .sw-strip{display:flex;gap:6px;margin-bottom:22px}' +
    '#swReview .sw-strip div{position:relative;flex:0 0 132px;height:132px;border-radius:8px;overflow:hidden;background:#f2f2f2;cursor:pointer}' +
    '#swReview .sw-strip img{width:100%;height:100%;object-fit:cover;display:block}' +
    '#swReview .sw-strip .sw-more{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
      'flex-direction:column;background:rgba(0,0,0,.45);color:#fff;font-size:13px;font-weight:600;line-height:1.3}' +
    /* 아래는 팝업(body 에 붙는다) 안에서도 쓰이므로 #swReview 로 묶지 않는다 */
    '.sw-item{display:flex;gap:16px;padding:18px 0;border-top:1px solid #f0f0f0;text-align:left}' +
    '.sw-item .sw-col{flex:1;min-width:0}' +
    '.sw-who{display:flex;align-items:center;gap:8px;margin-bottom:6px}' +
    '.sw-ico{width:26px;height:26px;border-radius:50%;background:#e9e9e9;flex:0 0 26px}' +
    '.sw-rate{color:#ff4757;font-weight:700}' +
    '.sw-id{font-size:13px;color:#555}' +
    '.sw-date{font-size:13px;color:#8e8e8e}' +
    '.sw-tagline{font-size:13px;color:#8e8e8e;margin:4px 0 8px}' +
    '.sw-body{white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.6}' +
    '.sw-thumb{flex:0 0 108px;width:108px;height:108px;border-radius:8px;overflow:hidden;background:#f2f2f2;cursor:pointer}' +
    '.sw-thumb img{width:100%;height:100%;object-fit:cover;display:block;max-width:none}' +
    '.sw-btn{display:block;width:100%;padding:14px;margin-top:18px;background:#fff;border:1px solid #ddd;' +
      'border-radius:8px;font-size:14px;color:#333;cursor:pointer;text-align:center;text-decoration:none;' +
      'font-family:inherit;line-height:1.4;box-sizing:border-box}' +
    '.sw-btn:hover{background:#fafafa}' +
    '#swReview .sw-write{margin-top:8px}' +
    '.sw-hidden{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}' +
    '.sw-dim{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;z-index:9998}' +
    '.sw-dim.on{display:block}' +
    '.sw-modal{position:fixed;inset:0;display:none;z-index:9999;align-items:center;justify-content:center;padding:20px}' +
    '.sw-modal.on{display:flex}' +
    '.sw-panel{background:#fff;border-radius:12px;width:100%;max-width:720px;max-height:90vh;display:flex;' +
      'flex-direction:column;overflow:hidden;font:14px/1.6 -apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#222}' +
    '.sw-panel header{padding:18px 20px 12px;border-bottom:1px solid #f0f0f0}' +
    '.sw-panel .sw-title{display:flex;justify-content:space-between;align-items:center}' +
    '.sw-panel .sw-title h4{margin:0;font-size:17px}' +
    '.sw-panel .sw-x{border:0;background:none;font-size:22px;line-height:1;color:#888;cursor:pointer;padding:0 4px}' +
    '.sw-filters{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:12px}' +
    '.sw-chip{border:1px solid #ddd;background:#fff;border-radius:999px;padding:6px 12px;font-size:13px;color:#444;cursor:pointer}' +
    '.sw-chip.on{background:#222;border-color:#222;color:#fff}' +
    '.sw-sorts{margin-left:auto;display:flex;gap:6px}' +
    '.sw-list{overflow-y:auto;padding:0 20px 20px}' +
    '.sw-list .sw-item:first-child{border-top:0}' +
    '.sw-empty{padding:40px 0;text-align:center;color:#8e8e8e}' +
    '.sw-light{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;z-index:10000;' +
      'align-items:center;justify-content:center;padding:24px}' +
    '.sw-light.on{display:flex}' +
    '.sw-light img{max-width:100%;max-height:100%;object-fit:contain}' +
    '@media (max-width:640px){#swReview .sw-strip div{flex:0 0 104px;height:104px}' +
      '#swReview .sw-thumb{flex:0 0 84px;height:84px}.sw-sorts{margin-left:0;width:100%}}';
  }

  function itemHtml(r) {
    var thumb = r.photo
      ? '<div class="sw-thumb"><img src="' + esc(r.photo) + '" alt="" loading="lazy"></div>' : '';
    return '<div class="sw-item"><div class="sw-col">' +
      '<div class="sw-who"><span class="sw-ico"></span>' +
      '<span class="sw-rate">' + stars(r.rating) + r.rating + '</span>' +
      '<span class="sw-id">' + esc(r.writer) + '</span>' +
      '<span class="sw-date">· ' + fmtDate(r.date) + '</span></div>' +
      '<div class="sw-tagline">네이버 스마트스토어 · ' + esc(r.kind) + '</div>' +
      '<div class="sw-body">' + esc(r.text) + '</div></div>' + thumb + '</div>';
  }

  function picked() {
    var f = state.filter, s = state.sort;
    var list = state.data.reviews.filter(function (r) {
      if (f === 'photo') return !!r.photo;
      if (f !== 'all') return r.rating === +f;
      return true;
    });
    list.sort(function (a, b) {
      if (s === 'high') return b.rating - a.rating || b.date.localeCompare(a.date);
      if (s === 'low') return a.rating - b.rating || b.date.localeCompare(a.date);
      return b.date.localeCompare(a.date);
    });
    return list;
  }

  function drawModal() {
    var list = picked(), box = $('.sw-list');
    $('.sw-panel .sw-title h4').textContent = '리뷰 ' + list.length;
    if (!list.length) { box.innerHTML = '<p class="sw-empty">해당하는 후기가 없습니다.</p>'; return; }
    box.innerHTML = list.slice(0, state.shown).map(itemHtml).join('') +
      (list.length > state.shown
        ? '<button class="sw-btn" data-act="more">더보기 (' + (list.length - state.shown) + ')</button>' : '');
  }

  function openModal() {
    state.shown = PAGE;
    drawModal();
    $('.sw-dim').classList.add('on');
    $('.sw-modal').classList.add('on');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    $('.sw-dim').classList.remove('on');
    $('.sw-modal').classList.remove('on');
    document.body.style.overflow = '';
  }
  function closeLight() { $('.sw-light').classList.remove('on'); }

  function build(board, data) {
    var d = data, photos = d.reviews.filter(function (r) { return r.photo; });

    var cells = photos.slice(0, STRIP + 1).map(function (r, i) {
      var img = '<img src="' + esc(r.photo) + '" alt="" loading="lazy">';
      return (i === STRIP && photos.length > STRIP)
        ? '<div data-act="photos">' + img + '<span class="sw-more">더보기<br>+' + (photos.length - STRIP) + '</span></div>'
        : '<div>' + img + '</div>';
    }).join('');

    var style = document.createElement('style');
    style.textContent = css();
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.id = 'swReview';
    wrap.innerHTML =
      '<div class="sw-head"><h3>리뷰 ' + d.count + '</h3><span class="sw-std">후기 제공 기준</span></div>' +
      '<div class="sw-score"><span class="sw-star">★</span><b>' + d.average.toFixed(2) + '</b></div>' +
      '<div class="sw-notice">' + NOTICE + '</div>' +
      (photos.length ? '<div class="sw-strip">' + cells + '</div>' : '') +
      d.reviews.slice(0, HEAD).map(itemHtml).join('') +
      '<button class="sw-btn" data-act="all">리뷰 전체보기 (' + d.count + ')</button>';

    var modal = document.createElement('div');
    modal.innerHTML =
      '<div class="sw-dim"></div>' +
      '<div class="sw-modal"><div class="sw-panel"><header>' +
      '<div class="sw-title"><h4>리뷰</h4><button class="sw-x" data-act="close">&times;</button></div>' +
      '<div class="sw-filters">' +
      '<button class="sw-chip on" data-filter="all">전체</button>' +
      '<button class="sw-chip" data-filter="photo">사진 후기</button>' +
      '<button class="sw-chip" data-filter="5">5점</button>' +
      '<button class="sw-chip" data-filter="4">4점</button>' +
      '<button class="sw-chip" data-filter="3">3점</button>' +
      '<span class="sw-sorts">' +
      '<button class="sw-chip on" data-sort="new">최신순</button>' +
      '<button class="sw-chip" data-sort="high">별점 높은순</button>' +
      '<button class="sw-chip" data-sort="low">별점 낮은순</button>' +
      '</span></div></header><div class="sw-list"></div></div></div>' +
      '<div class="sw-light"><img src="" alt=""></div>';
    while (modal.firstChild) document.body.appendChild(modal.firstChild);

    board.parentNode.insertBefore(wrap, board);

    // 기본 게시판은 DOM 에 남기고 화면에서만 가린다. '후기 쓰기' 버튼은 옮겨 온다.
    var write = board.querySelector('a[href*="write"], .btnNormal[href*="write"]');
    if (write) {
      var clone = write.cloneNode(true);
      clone.className = 'sw-btn sw-write';
      clone.textContent = '후기 쓰기';
      wrap.appendChild(clone);
    }
    board.classList.add('sw-hidden');

    document.addEventListener('click', function (e) {
      var t = e.target;
      var img = t.closest && t.closest('#swReview img, .sw-list img');
      var hit = t.closest && t.closest('[data-act],[data-filter],[data-sort]');

      if (hit) {
        var act = hit.dataset.act;
        if (act === 'all') { e.preventDefault(); openModal(); return; }
        if (act === 'close') { e.preventDefault(); closeModal(); return; }
        if (act === 'more') { e.preventDefault(); state.shown += PAGE; drawModal(); return; }
        if (act === 'photos') {
          e.preventDefault();
          state.filter = 'photo';
          document.querySelectorAll('.sw-chip[data-filter]').forEach(function (x) { x.classList.remove('on'); });
          $('.sw-chip[data-filter="photo"]').classList.add('on');
          openModal();
          return;
        }
        if (hit.dataset.filter || hit.dataset.sort) {
          var isSort = !!hit.dataset.sort;
          document.querySelectorAll('.sw-chip[data-' + (isSort ? 'sort' : 'filter') + ']')
            .forEach(function (x) { x.classList.remove('on'); });
          hit.classList.add('on');
          if (isSort) state.sort = hit.dataset.sort; else state.filter = hit.dataset.filter;
          state.shown = PAGE;
          drawModal();
          return;
        }
      }
      if (img) { $('.sw-light img').src = img.src; $('.sw-light').classList.add('on'); return; }
      if (t.closest && (t.closest('.sw-dim') || t.closest('.sw-light'))) { closeLight(); closeModal(); }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeLight(); closeModal(); }
    });
  }

  /* 상품별 데이터 파일을 불러온다. 없거나 실패하면 아무것도 하지 않는다. */
  function loadData(no, done) {
    var s = document.createElement('script');
    s.src = DATA_BASE + 'reviews_' + no + '.js';
    s.async = true;
    s.onload = function () {
      done((window.__SW_REVIEWS__ || {})[no] || null);
    };
    s.onerror = function () { done(null); };   // 후기를 안 옮긴 상품은 파일이 없다
    document.head.appendChild(s);
  }

  function start() {
    var board, no;
    try {
      board = findBoard();
      no = productNo();
      if (!board || !no) return;
    } catch (e) { return; }

    loadData(no, function (data) {
      try {
        if (!data || !data.reviews || !data.reviews.length) return;   // 없으면 기본 게시판 그대로
        state.data = data;
        build(board, data);
      } catch (e) { /* 실패하면 기본 게시판이 그대로 보인다 */ }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
