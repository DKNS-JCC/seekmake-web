// Navegación móvil
const navToggle = document.getElementById('navToggle');
const navMenuMobile = document.getElementById('navMenuMobile');
const navLinks = document.querySelectorAll('.nav-link');

navToggle.addEventListener('click', () => {
    navMenuMobile.classList.toggle('hidden');
    navMenuMobile.classList.toggle('flex');
    
    // Animar el botón hamburguesa
    const spans = navToggle.querySelectorAll('span');
    if (!navMenuMobile.classList.contains('hidden')) {
        spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(7px, -6px)';
    } else {
        spans[0].style.transform = 'none';
        spans[1].style.opacity = '1';
        spans[2].style.transform = 'none';
    }
});

// Cerrar menú al hacer clic en un enlace
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        if (navMenuMobile) {
            navMenuMobile.classList.add('hidden');
            navMenuMobile.classList.remove('flex');
            const spans = navToggle.querySelectorAll('span');
            spans[0].style.transform = 'none';
            spans[1].style.opacity = '1';
            spans[2].style.transform = 'none';
        }
    });
});

// Scroll suave
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const offsetTop = target.offsetTop - 70;
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
        }
    });
});

// Efecto de scroll en la navegación
const navbar = document.getElementById('navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    // Añadir sombra al hacer scroll
    if (currentScroll > 50) {
        navbar.classList.add('shadow-lg');
    } else {
        navbar.classList.remove('shadow-lg');
    }
    
    lastScroll = currentScroll;
});

// Marcar enlace activo según la sección visible
const sections = document.querySelectorAll('section[id]');

function highlightNavigation() {
    const scrollY = window.pageYOffset;
    
    sections.forEach(section => {
        const sectionHeight = section.offsetHeight;
        const sectionTop = section.offsetTop - 100;
        const sectionId = section.getAttribute('id');
        const navLink = document.querySelector(`.nav-link[href="#${sectionId}"]`);
        
        if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
            navLinks.forEach(link => {
                link.classList.remove('active');
                link.classList.remove('border-b-2');
                link.classList.remove('border-accent');
            });
            if (navLink && !navLink.classList.contains('bg-accent')) {
                navLink.classList.add('active');
                navLink.classList.add('border-b-2');
                navLink.classList.add('border-accent');
            }
        }
    });
}

window.addEventListener('scroll', highlightNavigation);

// Animación de aparición al hacer scroll (Intersection Observer)
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observar elementos para animación
const animatedElements = document.querySelectorAll('.service-card, .portfolio-item, .contact-item, .quote-feature');
animatedElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

// Ya no usamos un formulario de envío; las acciones de contacto son enlaces interactivos.

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    highlightNavigation();
});