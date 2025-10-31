<template>
  <div id="app" class="flex flex-col min-h-screen bg-white dark:bg-gray-900">
    <!-- Navigation -->
    <Navigation @toggle-dark-mode="onToggleDarkMode" />

    <!-- Main content -->
    <main class="flex-1 pt-16">
      <!-- Hero Section -->
      <HeroSection />

      <!-- Services Section -->
      <ServicesSection />

      <!-- Color Showcase -->
      <section id="muestrario" class="py-20 bg-gray-50 dark:bg-gray-900">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center mb-12 animate-fade-in-up">
            <span class="inline-block px-4 py-2 bg-accent/10 rounded-full border border-accent/30 mb-4">
              <span class="text-accent font-semibold text-sm">🎨 Muestrario</span>
            </span>
            <h2 class="text-4xl md:text-5xl font-bold text-center mb-4 dark:text-white">Muestrario de Colores</h2>
            <p class="text-center text-gray-600 dark:text-gray-300 text-lg max-w-3xl mx-auto">
              Disponemos de una amplia gama de colores y acabados para tu proyecto. Visita nuestra sección completa de muestrario para ver todas las opciones disponibles.
            </p>
          </div>

          <!-- Color grid with animation -->
          <div class="flex justify-center gap-6 mb-8 flex-wrap">
            <div 
              v-for="(color, index) in colors" 
              :key="color"
              class="w-24 h-24 rounded-xl shadow-lg hover:scale-110 hover:rotate-6 transition-all duration-300 cursor-pointer border-4 border-white dark:border-gray-800 group hover:shadow-2xl"
              :style="{ background: color }"
              :title="`Color: ${color}`"
            >
              <div class="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span class="text-white font-bold text-sm">{{ getColorName(color) }}</span>
              </div>
            </div>
          </div>

          <!-- View all button -->
          <div class="text-center">
            <a href="#" class="inline-block bg-transparent text-accent border-2 border-accent px-8 py-3 rounded-lg font-semibold hover:bg-accent hover:text-white transition-all duration-300 hover:scale-105">
              Ver Muestrario Completo
            </a>
          </div>
        </div>
      </section>

      <!-- Portfolio Section -->
      <PortfolioSection />

      <!-- Budget Section -->
      <BudgetSection />

      <!-- Contact Section -->
      <ContactSection />
    </main>

    <!-- Footer -->
    <Footer />

    <!-- Terms Banner -->
    <Transition name="slide-up">
      <div v-if="!termsAccepted" class="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 shadow-2xl border-t-2 border-accent z-50 backdrop-blur-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div class="flex items-start gap-4 flex-1">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-accent flex-shrink-0 mt-0.5 animate-bounce">
                <path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
              <p class="text-sm text-gray-700 dark:text-gray-300">
                Al navegar por esta web, aceptas nuestros 
                <a href="#" class="text-accent font-semibold hover:underline">Términos y Condiciones</a>. 
                Utilizamos tu información únicamente para procesar tus solicitudes de impresión 3D.
              </p>
            </div>
            <div class="flex gap-3 flex-shrink-0">
              <button @click="acceptTerms" class="group relative inline-flex items-center gap-2 bg-accent text-white px-6 py-2 rounded-lg font-semibold overflow-hidden hover:shadow-lg transition-all duration-300">
                <div class="absolute inset-0 bg-blue-600 transform -skew-x-12 group-hover:skew-x-12 transition-transform duration-500 -z-10"></div>
                <span class="relative">Aceptar</span>
              </button>
              <button @click="termsAccepted = true" class="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-all hover:scale-105">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Scroll to top button -->
    <Transition name="fade">
      <button 
        v-if="showScrollTop"
        @click="scrollToTop"
        class="fixed bottom-8 right-8 bg-accent text-white p-3 rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 z-40 animate-pulse"
        aria-label="Volver arriba"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
        </svg>
      </button>
    </Transition>
  </div>
</template>

<script>
import Navigation from './components/Navigation.vue'
import HeroSection from './components/HeroSection.vue'
import ServicesSection from './components/ServicesSection.vue'
import PortfolioSection from './components/PortfolioSection.vue'
import BudgetSection from './components/BudgetSection.vue'
import ContactSection from './components/ContactSection.vue'
import Footer from './components/Footer.vue'

export default {
  name: 'App',
  components: {
    Navigation,
    HeroSection,
    ServicesSection,
    PortfolioSection,
    BudgetSection,
    ContactSection,
    Footer
  },
  data() {
    return {
      termsAccepted: false,
      showScrollTop: false,
      colors: [
        '#1a1a1a', // Negro
        '#ffffff', // Blanco
        '#e74c3c', // Rojo
        '#3498db', // Azul
        '#2ecc71', // Verde
        '#f39c12', // Naranja
        '#9b59b6', // Púrpura
        '#1abc9c', // Turquesa
        '#f1c40f', // Amarillo
        '#e67e22'  // Marrón
      ]
    }
  },
  mounted() {
    this.checkTermsAcceptance();
    window.addEventListener('scroll', this.handleScroll);
  },
  beforeUnmount() {
    window.removeEventListener('scroll', this.handleScroll);
  },
  methods: {
    checkTermsAcceptance() {
      const accepted = localStorage.getItem('termsAccepted') === 'true';
      this.termsAccepted = accepted;
    },
    acceptTerms() {
      localStorage.setItem('termsAccepted', 'true');
      this.termsAccepted = true;
    },
    handleScroll() {
      this.showScrollTop = window.scrollY > 300;
    },
    scrollToTop() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onToggleDarkMode(isDarkMode) {
      // Puedes hacer algo aquí si necesitas sincronizar el dark mode
    },
    getColorName(color) {
      const colorNames = {
        '#1a1a1a': 'Negro',
        '#ffffff': 'Blanco',
        '#e74c3c': 'Rojo',
        '#3498db': 'Azul',
        '#2ecc71': 'Verde',
        '#f39c12': 'Naranja',
        '#9b59b6': 'Púrpura',
        '#1abc9c': 'Turquesa',
        '#f1c40f': 'Amarillo',
        '#e67e22': 'Marrón'
      };
      return colorNames[color] || 'Color';
    }
  }
}
</script>

<style scoped>
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 0.6s ease-out forwards;
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(100%);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateY(100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
