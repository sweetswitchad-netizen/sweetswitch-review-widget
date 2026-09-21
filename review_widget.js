/* 스윗스위치 상품후기 위젯
 *
 * 카페24 상품 상세 페이지의 기본 상품후기 목록을 네이버 스마트스토어 모양으로 다시 그린다.
 * 게시판 데이터는 건드리지 않는다. 화면만 바꾼다.
 *
 * 넣는 법: 스크립트태그 API 로 상품 상세 화면에만 설치 (또는 SEO 코드 입력란).
 * 데이터  : 두 군데서 합친다.
 *   1) 스냅샷  DATA_BASE + 'reviews_{카페24상품번호}.js'  (build_widget_data.py 가 게시판 전체로 만든다)
 *              카페24 파일업로더가 이미지·HTML/CSS/JS·웹폰트만 받아서 .json 이 아니라 .js 로 올린다.
 *              그 파일은 window.__SW_REVIEWS__[상품번호] 에 데이터를 넣어 둔다.
 *   2) 실시간  스냅샷 뒤에 게시판에 들어온 글 (글번호 > maxNo).
 *              카페24 Front API 에는 게시판 조회가 없어서(09-17 확인), 이 페이지에 들어 있는 기본 게시판
 *              목록(최신 몇 건)에서 글번호·별점·작성일을 읽고, 글 상세 페이지를 받아 본문·사진을 읽는다.
 *              실패하면 스냅샷만 보여준다. 글 상세를 받을 때 그 글의 조회수가 1 오른다.
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
  var HEAD = 5;                               // 상품 페이지에 미리 보여줄 수
  var STRIP = 5;                              // 사진 스트립 장수
  var NOTICE = '네이버 스마트스토어 구매 후기가 포함되어 있습니다.';
  var SHOP = '스윗스위치';
  var LIVE_MAX = 10;                          // 실시간으로 읽을 새 글 최대 수
  var LIVE_WAIT = 5000;                       // 실시간 읽기를 기다리는 최대 시간(ms)

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

  /* 상품번호. 카페24는 주소를 두 가지로 쓴다.
   *   /product/detail.html?product_no=13
   *   /product/{상품명}/13/category/1/display/2/      ← 메인·목록에서 눌러 들어오면 이쪽
   * 그래서 물음표 뒤만 보면 안 된다. 셋 다 시도한다. */
  function productNo() {
    var m = location.search.match(/[?&]product_no=(\d+)/);
    if (m) return m[1];
    m = location.pathname.match(/\/product\/[^/]+\/(\d+)(?:\/|$)/);
    if (m) return m[1];
    var meta = $('meta[property="product:retailer_item_id"]');
    if (meta && /^\d+$/.test(meta.content)) return meta.content;
    var input = $('input[name="product_no"]');
    return input && input.value ? input.value : null;
  }

  function css() {
    return '' +
    '#swReview{font:14px/1.6 -apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#222;' +
      'text-align:left;margin:0 0 40px;max-width:100%}' +   /* 위쪽 여백은 #review 의 padding 이 준다 */
    '#swReview *{box-sizing:border-box}' +
    '#swReview .sw-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}' +
    '#swReview .sw-head h3{font-size:19px;margin:0}' +
    '#swReview .sw-std{font-size:12px;color:#8e8e8e}' +
    '#swReview .sw-score{display:flex;align-items:center;gap:8px;font-size:13px;color:#8e8e8e}' +
    '#swReview .sw-score b{font-size:20px;color:#222}' +
    '#swReview .sw-score .sw-star{color:#ff4757;font-size:18px}' +
    '#swReview .sw-notice{margin:12px 0 18px;padding:9px 12px;background:#f7f8fa;border-radius:6px;font-size:12px;color:#555}' +
    '#swReview .sw-strip{display:flex;gap:6px;margin-bottom:22px;overflow-x:auto;overflow-y:hidden;' +
      '-webkit-overflow-scrolling:touch;scrollbar-width:none;overscroll-behavior-x:contain}' +
    '#swReview .sw-strip::-webkit-scrollbar{display:none}' +
    '#swReview .sw-strip div{position:relative;flex:0 0 132px;height:132px;border-radius:8px;overflow:hidden;background:#f2f2f2;cursor:pointer}' +
    '#swReview .sw-strip img{width:100%;height:100%;object-fit:cover;display:block}' +
    '#swReview .sw-strip .sw-more{position:absolute;top:0;right:0;bottom:0;left:0;display:flex;align-items:center;justify-content:center;' +
      'flex-direction:column;background:rgba(0,0,0,.45);color:#fff;font-size:13px;font-weight:600;line-height:1.3}' +
    /* 아래는 팝업(body 에 붙는다) 안에서도 쓰이므로 #swReview 로 묶지 않는다 */
    '.sw-item{display:flex;gap:16px;padding:18px 0;border-top:1px solid #f0f0f0;text-align:left}' +
    '.sw-item .sw-col{flex:1;min-width:0}' +
    '.sw-who{display:flex;flex-wrap:wrap;align-items:center;gap:2px 8px;margin-bottom:6px;min-width:0}' +
    '.sw-ico{width:26px;height:26px;border-radius:50%;background:#e9e9e9;flex:0 0 26px}' +
    '.sw-rate{color:#ff4757;font-weight:700}' +
    '.sw-id{font-size:13px;color:#555;overflow-wrap:anywhere;word-break:break-all}' +
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
    '.sw-dim{position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.5);display:none;z-index:9998}' +
    '.sw-dim.on{display:block}' +
    '.sw-modal{position:fixed;top:0;right:0;bottom:0;left:0;display:none;z-index:9999;align-items:center;justify-content:center;padding:20px;overflow:hidden}' +
    '.sw-modal.on{display:flex}' +
    '.sw-panel{background:#fff;border-radius:12px;width:100%;max-width:720px;min-width:0;max-height:90vh;display:flex;' +
      'flex-direction:column;overflow:hidden;font:14px/1.6 -apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#222}' +
    '.sw-panel header{padding:18px 20px 12px;border-bottom:1px solid #f0f0f0}' +
    '.sw-panel .sw-title{display:flex;justify-content:space-between;align-items:center}' +
    '.sw-panel .sw-title h4{margin:0;font-size:17px}' +
    '.sw-panel .sw-x{border:0;background:none;font-size:24px;line-height:1;color:#666;cursor:pointer;' +
      'width:40px;height:40px;margin:-8px -10px -8px 0;padding:0;flex:0 0 40px;font-family:inherit}' +
    '.sw-filters{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:12px}' +
    '.sw-chip{border:1px solid #ddd;background:#fff;border-radius:999px;padding:6px 12px;font-size:13px;color:#444;cursor:pointer}' +
    '.sw-chip.on{background:#222;border-color:#222;color:#fff}' +
    '.sw-sorts{margin-left:auto;display:flex;gap:6px}' +
    '.sw-list{overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding:0 20px 20px}' +
    '.sw-list .sw-item:first-child{border-top:0}' +
    '.sw-empty{padding:40px 0;text-align:center;color:#8e8e8e}' +
    '.sw-light{position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.85);display:none;z-index:10000;' +
      'align-items:center;justify-content:center;padding:24px}' +
    '.sw-light.on{display:flex}' +
    '.sw-light img{max-width:100%;max-height:100%;object-fit:contain}' +
    '.sw-light .sw-lx{position:absolute;top:8px;right:8px;top:calc(env(safe-area-inset-top,0px) + 8px);' +
      'right:calc(env(safe-area-inset-right,0px) + 8px);width:44px;height:44px;padding:0;border:0;border-radius:50%;' +
      'background:rgba(0,0,0,.55);color:#fff;font-size:26px;line-height:44px;cursor:pointer;font-family:inherit}' +
    '@media (max-width:640px){#swReview .sw-strip div{flex:0 0 104px;height:104px}' +
      '.sw-item{gap:12px}.sw-thumb{flex:0 0 76px;width:76px;height:76px}' +
      '.sw-modal{padding:10px}.sw-panel{max-height:94vh}.sw-panel header{padding:14px 14px 10px}' +
      '.sw-list{padding:0 14px 14px}.sw-chip{padding:5px 10px}.sw-sorts{margin-left:0;width:100%}}';
  }

  function itemHtml(r) {
    var thumb = r.photo
      ? '<div class="sw-thumb"><img src="' + esc(r.photo) + '" alt="" loading="lazy"></div>' : '';
    return '<div class="sw-item"><div class="sw-col">' +
      '<div class="sw-who"><span class="sw-ico"></span>' +
      (r.rating ? '<span class="sw-rate">' + stars(r.rating) + r.rating + '</span>' : '') +
      '<span class="sw-id">' + esc(r.writer) + '</span>' +
      '<span class="sw-date">· ' + fmtDate(r.date) + '</span></div>' +
      '<div class="sw-tagline">' + (r.source === 'shop' ? SHOP : '네이버 스마트스토어') + ' · ' + esc(r.kind) + '</div>' +
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
    if (window.scrollX) window.scrollTo(0, window.scrollY);   // 가로로 밀려 있으면 되돌린다
  }
  /* 휴대폰에서 팝업을 보다 확대한 채 닫으면 화면이 확대된 그대로 남는다.
   * viewport 의 maximum-scale 을 잠깐 1 로 바꿨다 되돌리면 브라우저가 배율을 1 로 맞춘다. 확대 기능은 그대로 유지된다. */
  var zooming = false;
  function resetZoom() {
    var vv = window.visualViewport;
    if (zooming || !vv || vv.scale <= 1.01) return;
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    var orig = meta.getAttribute('content') || '';
    var fixed = /maximum-scale\s*=\s*[\d.]+/.test(orig)
      ? orig.replace(/maximum-scale\s*=\s*[\d.]+/, 'maximum-scale=1.0')
      : orig + (orig ? ', ' : '') + 'maximum-scale=1.0';
    zooming = true;
    meta.setAttribute('content', fixed);
    setTimeout(function () { meta.setAttribute('content', orig); zooming = false; }, 400);
  }
  function closeModal() {
    var wasOpen = $('.sw-modal').classList.contains('on');
    $('.sw-dim').classList.remove('on');
    $('.sw-modal').classList.remove('on');
    if (!$('.sw-light').classList.contains('on')) document.body.style.overflow = '';
    if (wasOpen) resetZoom();
  }
  /* 사진 확대. 목록 팝업 없이 상품 페이지에서 바로 열릴 수도 있다. */
  function openLight(src) {
    $('.sw-light img').src = src;
    $('.sw-light').classList.add('on');
    document.body.style.overflow = 'hidden';
    if (window.scrollX) window.scrollTo(0, window.scrollY);   // 가로로 밀려 있으면 되돌린다
  }
  function closeLight() {
    var wasOpen = $('.sw-light').classList.contains('on');
    $('.sw-light').classList.remove('on');
    if (!$('.sw-modal').classList.contains('on')) document.body.style.overflow = '';
    if (wasOpen) resetZoom();
  }

  /* 상품 페이지 쪽 위젯 내용. 실시간 글이 도착하면 다시 그린다. */
  function render() {
    var d = state.data, wrap = state.wrap;
    var photos = d.reviews.filter(function (r) { return r.photo; });

    var cells = photos.slice(0, STRIP + 1).map(function (r, i) {
      var img = '<img src="' + esc(r.photo) + '" alt="" loading="lazy">';
      return (i === STRIP && photos.length > STRIP)
        ? '<div data-act="photos">' + img + '<span class="sw-more">더보기<br>+' + (photos.length - STRIP) + '</span></div>'
        : '<div>' + img + '</div>';
    }).join('');

    wrap.innerHTML =
      '<div class="sw-head"><h3>리뷰 ' + d.count + '</h3><span class="sw-std">후기 제공 기준</span></div>' +
      '<div class="sw-score"><span class="sw-star">★</span><b>' + d.average.toFixed(2) + '</b></div>' +
      '<div class="sw-notice">' + NOTICE + '</div>' +
      (photos.length ? '<div class="sw-strip">' + cells + '</div>' : '') +
      d.reviews.slice(0, HEAD).map(itemHtml).join('') +
      '<button class="sw-btn" data-act="all">리뷰 전체보기 (' + d.count + ')</button>';
    if (state.write) wrap.appendChild(state.write);
    if ($('.sw-modal.on')) drawModal();
  }

  function build(board, data) {
    var style = document.createElement('style');
    style.textContent = css();
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.id = 'swReview';
    state.wrap = wrap;

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
      '<div class="sw-light"><button class="sw-lx" type="button" data-act="lclose" aria-label="닫기">&times;</button>' +
      '<img src="" alt=""></div>';
    while (modal.firstChild) document.body.appendChild(modal.firstChild);

    // '후기 쓰기' 버튼은 기본 게시판 것을 그대로 가져와 쓴다 (원본을 옮기기 전에 복사해 둔다).
    var write = board.querySelector('a[href*="write"], .btnNormal[href*="write"]');
    if (write) {
      var clone = write.cloneNode(true);
      clone.className = 'sw-btn sw-write';
      clone.textContent = '후기 쓰기';
      state.write = clone;
    }
    render();

    // 위젯을 게시판 영역 '안쪽' 에 넣는다. 영역 자체를 감추면 '상품후기' 탭이 가리키는 위치가
    // 어긋나 엉뚱한 데로 스크롤된다. 원래 내용은 안쪽 상자에 담아 화면에서만 가린다(검색 노출 유지).
    //
    // #prdReview 안에 있는 빈 div#review 는 탭이 가리키는 기준점이자 위쪽 여백(padding-top)이다.
    // 이것까지 같이 숨기면 여백이 사라져 상세이미지와 붙고, 탭도 엉뚱한 데로 스크롤된다.
    // 그래서 기준점은 제자리에 두고 그 뒤에 위젯을 넣는다.
    var anchor = board.querySelector('#review');
    var keep = document.createElement('div');
    keep.className = 'sw-orig sw-hidden';
    [].slice.call(board.childNodes).forEach(function (n) {
      if (n !== anchor) keep.appendChild(n);
    });
    board.appendChild(wrap);
    board.appendChild(keep);

    document.addEventListener('click', function (e) {
      var t = e.target;
      var img = t.closest && t.closest('#swReview img, .sw-list img');
      var hit = t.closest && t.closest('[data-act],[data-filter],[data-sort]');

      if (hit) {
        var act = hit.dataset.act;
        if (act === 'all') { e.preventDefault(); openModal(); return; }
        if (act === 'close') { e.preventDefault(); closeModal(); return; }
        if (act === 'lclose') { e.preventDefault(); closeLight(); return; }
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
      if (img) { openLight(img.src); return; }
      // 사진 확대를 눌렀으면 사진만 닫는다. 뒤에 있는 리뷰 목록은 그대로 둔다.
      if (t.closest && t.closest('.sw-light')) { closeLight(); return; }
      if (t.closest && t.closest('.sw-dim')) { closeModal(); }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if ($('.sw-light').classList.contains('on')) closeLight(); else closeModal();
    });
  }

  /* ---- 실시간: 스냅샷 뒤에 들어온 글 ---- */

  /* 기본 게시판 목록에서 글번호 > maxNo 인 줄을 찾는다. PC(표)·모바일(목록) 어느 쪽이든 링크 기준으로 찾는다. */
  function liveRows(board, maxNo) {
    var seen = {}, rows = [];
    [].slice.call(board.querySelectorAll('a[href*="/article/"]')).forEach(function (a) {
      var href = a.getAttribute('href') || '';
      var m = href.match(/[?&]no=(\d+)/) || href.match(/\/article\/[^/]+\/\d+\/(\d+)/);
      if (!m) return;
      var no = +m[1];
      if (no <= maxNo || seen[no]) return;
      seen[no] = 1;
      var row = a.closest('tr, li') || a.parentNode;
      if (row.querySelector('img[alt*="답변"], img[src*="ico_re"]')) return;   // 답글
      if (row.querySelector('img[alt*="비밀"], img[src*="ico_lock"]')) return; // 비밀글
      var rate = row.querySelector('img[alt$="점"]');
      var date = (row.textContent.match(/\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}(?::\d{2})?)?/) || [''])[0];
      var who = [].slice.call(row.querySelectorAll('td, .name, .writer')).map(function (x) {
        return x.textContent.trim();
      }).filter(function (t) { return /\*/.test(t) && t.length < 30; })[0] || '';
      rows.push({ no: no, href: a.href, rating: rate ? (parseInt(rate.alt, 10) || 0) : 0,
                  date: date, writer: who });
    });
    return rows.slice(0, LIVE_MAX);
  }

  function textOf(el) {
    var doc = el.ownerDocument, c = el.cloneNode(true);
    [].slice.call(c.querySelectorAll('img, script, style')).forEach(function (x) { x.parentNode.removeChild(x); });
    [].slice.call(c.querySelectorAll('br')).forEach(function (x) {
      x.parentNode.replaceChild(doc.createTextNode('\n'), x);
    });
    [].slice.call(c.querySelectorAll('p, div, li')).forEach(function (x) {
      x.appendChild(doc.createTextNode('\n'));
    });
    return c.textContent.replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* 글 상세 페이지 HTML → 리뷰 한 건. 네이버에서 옮긴 글은 본문 모양으로 알아본다. */
  function parseArticle(row, htmlText) {
    var doc = new DOMParser().parseFromString(htmlText, 'text/html');
    var detail = doc.querySelector('.xans-board-read .detail') || doc.querySelector('.detail');
    if (!detail) return null;                         // 권한 없음·비밀글 등
    var img = detail.querySelector('img[src*="file_data"]') || detail.querySelector('img');
    var photo = img ? img.getAttribute('src') : '';
    if (photo && photo.indexOf('//') === 0) photo = 'https:' + photo;
    var body = detail.querySelector('.fr-view') || detail;
    var all = body.textContent || '';
    var r = { id: String(row.no), no: row.no, rating: row.rating, date: row.date,
              photo: photo || null, source: 'shop', kind: '구매 리뷰', writer: row.writer || '구매자' };
    var foot = all.match(/네이버스마트스토어 구매자\s+(\S+)\s+·/);
    if (foot) {
      var p = body.querySelector('p[style="margin:0"]');
      r.source = 'naver';
      r.writer = foot[1];
      r.kind = /한달사용/.test(all.slice(0, 60)) ? '한달사용 리뷰' : '구매 리뷰';
      r.text = p ? textOf(p) : textOf(body);
    } else {
      r.text = textOf(body);
    }
    if (!r.date) {
      var t = doc.querySelector('.xans-board-read .etcArea .txtNum');
      r.date = t ? t.textContent.trim() : '';
    }
    return r.date ? r : null;
  }

  function loadLive(board, maxNo, done) {
    var rows = liveRows(board, maxNo);
    if (!rows.length || !window.fetch || !window.DOMParser) return;
    var got = [], left = rows.length, finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      if (got.length) done(got);
    }
    setTimeout(finish, LIVE_WAIT);
    rows.forEach(function (row) {
      fetch(row.href, { credentials: 'same-origin' })
        .then(function (res) { return res.ok ? res.text() : ''; })
        .then(function (t) { var r = t && parseArticle(row, t); if (r) got.push(r); })
        .catch(function () {})
        .then(function () { if (--left === 0) finish(); });
    });
  }

  function merge(data, extra) {
    var have = {}, list = data.reviews.slice();
    list.forEach(function (r) { have[r.no] = 1; });
    extra.forEach(function (r) { if (!have[r.no]) { have[r.no] = 1; list.push(r); } });
    list.sort(function (a, b) { return b.date.localeCompare(a.date); });
    var scores = list.filter(function (r) { return r.rating; });
    var sum = scores.reduce(function (s, r) { return s + r.rating; }, 0);
    return { product: data.product, maxNo: data.maxNo, count: list.length,
             average: scores.length ? Math.round(sum / scores.length * 100) / 100 : 0, reviews: list };
  }

  /* 상품별 데이터 파일을 불러온다. 없거나 실패하면 아무것도 하지 않는다. */
  function loadData(no, done) {
    var s = document.createElement('script');
    // 카페24 이미지 서버는 하루(max-age=86400) 캐시한다. 주소 끝을 한 시간마다 바꿔 새 파일이 1시간 안에 퍼지게 한다.
    s.src = DATA_BASE + 'reviews_' + no + '.js?v=' + Math.floor(Date.now() / 3600000);
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
      } catch (e) { return; /* 실패하면 기본 게시판이 그대로 보인다 */ }
      if (typeof data.maxNo !== 'number') return;             // 예전 형식 스냅샷
      try {
        loadLive(board, data.maxNo, function (extra) {
          try { state.data = merge(state.data, extra); render(); } catch (e) { /* 스냅샷만 보인다 */ }
        });
      } catch (e) { /* 스냅샷만 보인다 */ }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
