<template>
  <nav class="fixed top-0 left-0 right-0 bg-white dark:bg-gray-900 shadow-md z-50 transition-all duration-300" :class="{ 'shadow-lg': scrolled }">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center py-4">
        <!-- Logo -->
        <div class="flex items-center gap-2 cursor-pointer" @click="scrollToTop">
          <span class="text-accent text-2xl hover:scale-110 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9m0-9v9" />
            </svg>
          </span>
          <span class="text-xl font-bold text-primary dark:text-white">3DCC | Impresión 3D</span>
        </div>

        <!-- Mobile toggle -->
        <button class="lg:hidden flex flex-col gap-1.5 group" @click="mobileMenuOpen = !mobileMenuOpen">
          <span class="w-6 h-0.5 bg-primary dark:bg-white transition-all group-hover:bg-accent duration-300" :class="{ 'rotate-45 translate-y-2': mobileMenuOpen }"></span>
          <span class="w-6 h-0.5 bg-primary dark:bg-white transition-all group-hover:bg-accent duration-300" :class="{ 'opacity-0': mobileMenuOpen }"></span>
          <span class="w-6 h-0.5 bg-primary dark:bg-white transition-all group-hover:bg-accent duration-300" :class="{ '-rotate-45 -translate-y-2': mobileMenuOpen }"></span>
        </button>

        <!-- Desktop menu -->
        <ul class="hidden lg:flex gap-8 items-center">
          <li v-for="link in navLinks" :key="link.label">
            <a :href="link.href" class="nav-link text-primary dark:text-gray-200 font-medium hover:text-accent dark:hover:text-accent transition-colors relative group" :class="{ 'text-accent': activeLink === link.href }">
              {{ link.label }}
              <span class="absolute bottom-0 left-0 w-0 h-0.5 bg-accent group-hover:w-full transition-all duration-300"></span>
            </a>
          </li>
          <li>
            <button @click="toggleDarkMode" class="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors hover:scale-110 duration-200" aria-label="Cambiar modo oscuro">
              <svg v-if="isDarkMode" class="w-5 h-5 text-yellow-500 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <svg v-else class="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            </button>
          </li>
          <li>
            <a href="#presupuesto" class="bg-accent text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-600 transition-all hover:-translate-y-0.5 hover:shadow-lg duration-200">Obtener Precio</a>
          </li>
        </ul>
      </div>

      <!-- Mobile menu -->
      <transition name="slide-down">
        <div v-show="mobileMenuOpen" class="lg:hidden flex flex-col gap-4 pb-4 animate-in fade-in slide-in-from-top-2">
          <a v-for="link in navLinks" :key="link.label" :href="link.href" class="nav-link text-primary dark:text-gray-200 font-medium hover:text-accent transition-colors py-2 border-b border-gray-100 dark:border-gray-700 transform hover:translate-x-1 duration-200" @click="mobileMenuOpen = false">
            {{ link.label }}
          </a>
          <button @click="toggleDarkMode" class="flex items-center gap-3 text-primary dark:text-gray-200 font-medium hover:text-accent transition-colors py-2 border-b border-gray-100 dark:border-gray-700">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
            <span class="dark:hidden">Modo Oscuro</span>
            <span class="hidden dark:inline">Modo Claro</span>
          </button>
          <a href="#presupuesto" class="bg-accent text-white px-6 py-2.5 rounded-lg font-semibold text-center hover:bg-blue-600 transition-all">Obtener Precio</a>
        </div>
      </transition>
    </div>
  </nav>
</template>

<script>
export default {
  name: 'Navigation',
  emits: ['toggle-dark-mode'],
  data() {
    return {
      mobileMenuOpen: false,
      isDarkMode: false,
      scrolled: false,
      activeLink: '#inicio',
      navLinks: [
        { label: 'Inicio', href: '#inicio' },
        { label: 'Servicios', href: '#servicios' },
        { label: 'Trabajos', href: '#trabajos' },
        { label: 'Contacto', href: '#contacto' }
      ]
    }
  },
  mounted() {
    window.addEventListener('scroll', this.handleScroll);
    this.initDarkMode();
  },
  beforeUnmount() {
    window.removeEventListener('scroll', this.handleScroll);
  },
  methods: {
    handleScroll() {
      this.scrolled = window.scrollY > 20;
    },
    toggleDarkMode() {
      this.isDarkMode = !this.isDarkMode;
      const htmlElement = document.documentElement;
      if (this.isDarkMode) {
        htmlElement.classList.add('dark');
      } else {
        htmlElement.classList.remove('dark');
      }
      localStorage.setItem('darkMode', this.isDarkMode);
      this.$emit('toggle-dark-mode', this.isDarkMode);
    },
    initDarkMode() {
      const isDark = localStorage.getItem('darkMode') === 'true';
      this.isDarkMode = isDark;
      if (isDark) {
        document.documentElement.classList.add('dark');
      }
    },
    scrollToTop() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}
</script>

<style scoped>
.slide-down-enter-active, .slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@keyframes spin-slow {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.animate-spin-slow {
  animation: spin-slow 2s linear infinite;
}
</style>
