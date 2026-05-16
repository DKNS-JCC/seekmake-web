/* ================================================================
   3DCC — Shared JavaScript
   Handles: theme, nav, scroll, back-to-top, intersection observer,
            active link highlighting, cookie banner
================================================================ */

(function () {
    'use strict';

    /* ── Theme Toggle ───────────────────────────────────────── */
    const html = document.documentElement;
    const themeBtn = document.getElementById('themeToggle');
    const iconMoon = document.getElementById('iconMoon');
    const iconSun  = document.getElementById('iconSun');

    function syncIcons() {
        if (!iconMoon || !iconSun) return;
        const dark = html.classList.contains('dark');
        iconMoon.style.display = dark ? 'block' : 'none';
        iconSun.style.display  = dark ? 'none'  : 'block';
    }
    syncIcons();

    if (themeBtn) {
        themeBtn.addEventListener('click', function () {
            html.classList.toggle('dark');
            localStorage.setItem('theme', html.classList.contains('dark') ? 'dark' : 'light');
            syncIcons();
        });
    }

    /* ── Mobile Nav Toggle ──────────────────────────────────── */
    const navToggle = document.getElementById('navToggle');
    const navMobile = document.getElementById('navMenuMobile');

    if (navToggle && navMobile) {
        navToggle.addEventListener('click', function () {
            navMobile.classList.toggle('open');
            var spans = navToggle.querySelectorAll('span');
            var open = navMobile.classList.contains('open');
            if (spans.length >= 3) {
                spans[0].style.transform = open ? 'rotate(45deg) translate(5px, 5px)' : '';
                spans[1].style.opacity   = open ? '0' : '1';
                spans[2].style.transform = open ? 'rotate(-45deg) translate(7px, -6px)' : '';
            }
        });

        // Close mobile nav on link click
        navMobile.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', function () {
                navMobile.classList.remove('open');
                var spans = navToggle.querySelectorAll('span');
                if (spans.length >= 3) {
                    spans[0].style.transform = spans[2].style.transform = '';
                    spans[1].style.opacity = '1';
                }
            });
        });
    }

    /* ── Smooth Scroll ──────────────────────────────────────── */
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
        a.addEventListener('click', function (e) {
            var target = document.querySelector(a.getAttribute('href'));
            if (target) {
                e.preventDefault();
                window.scrollTo({ top: target.offsetTop - 64, behavior: 'smooth' });
            }
        });
    });

    /* ── Navbar Scroll Effect ───────────────────────────────── */
    var navbar = document.getElementById('navbar');
    if (navbar) {
        window.addEventListener('scroll', function () {
            navbar.classList.toggle('scrolled', window.scrollY > 50);
        });
    }

    /* ── Active Nav Link Highlighting ───────────────────────── */
    var sections = document.querySelectorAll('section[id]');
    var navLinks = document.querySelectorAll('ul.nav-links .nav-link, .nav-links .nav-link');

    if (sections.length && navLinks.length) {
        window.addEventListener('scroll', function () {
            var y = window.scrollY;
            sections.forEach(function (s) {
                var top = s.offsetTop - 100;
                if (y >= top && y < top + s.offsetHeight) {
                    navLinks.forEach(function (l) { l.classList.remove('active'); });
                    var active = document.querySelector('.nav-links .nav-link[href="#' + s.id + '"]');
                    if (active) active.classList.add('active');
                }
            });
        });
    }

    /* ── Back to Top ────────────────────────────────────────── */
    var btt = document.getElementById('backToTop');
    if (btt) {
        window.addEventListener('scroll', function () {
            btt.classList.toggle('visible', window.scrollY > 300);
        });
        btt.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    /* ── Intersection Observer (fade-up) ────────────────────── */
    var fadeEls = document.querySelectorAll('.fade-up');
    if (fadeEls.length && 'IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) e.target.classList.add('in');
            });
        }, { threshold: 0.08, rootMargin: '0px 0px -50px 0px' });
        fadeEls.forEach(function (el) { io.observe(el); });
    }

    /* ── Cookie / Terms Banner ──────────────────────────────── */
    var banner    = document.getElementById('cookieBanner');
    var acceptBtn = document.getElementById('acceptTerms');
    var closeBtn  = document.getElementById('closeTerms');

    if (banner && !localStorage.getItem('termsAccepted')) {
        setTimeout(function () { banner.classList.add('visible'); }, 2000);
    }
    if (acceptBtn) {
        acceptBtn.addEventListener('click', function () {
            localStorage.setItem('termsAccepted', 'true');
            if (banner) banner.classList.remove('visible');
        });
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', function () {
            if (banner) banner.classList.remove('visible');
        });
    }
})();
