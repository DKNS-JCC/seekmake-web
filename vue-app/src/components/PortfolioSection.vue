<template>
  <section id="trabajos" class="py-20 bg-white dark:bg-gray-800 relative">
    <!-- Background decoration -->
    <div class="absolute top-1/2 left-0 w-96 h-96 bg-accent/5 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
      <div class="text-center mb-16 animate-fade-in-up">
        <span class="inline-block px-4 py-2 bg-accent/10 rounded-full border border-accent/30 mb-4">
          <span class="text-accent font-semibold text-sm">🎯 Portafolio</span>
        </span>
        <h2 class="text-4xl md:text-5xl font-bold mb-4 dark:text-white">Algunos de nuestros trabajos</h2>
        <p class="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">Proyectos realizados con precisión y dedicación</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div
          v-for="(item, index) in portfolioItems"
          :key="item.id"
          :style="{ animationDelay: `${index * 100}ms` }"
          class="animate-fade-in-up"
        >
          <PortfolioItem 
            :title="item.title"
            :description="item.description"
            :image="item.image"
            :category="item.category"
            :tags="item.tags"
          />
        </div>
      </div>

      <!-- View more button -->
      <div class="text-center mt-12 animate-fade-in">
        <button class="group relative inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-accent to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-300 overflow-hidden">
          <div class="absolute inset-0 bg-gradient-to-r from-blue-600 to-accent transform -skew-x-12 group-hover:skew-x-12 transition-transform duration-500 -z-10"></div>
          <span class="relative">Ver más trabajos</span>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 group-hover:translate-x-1 transition-transform">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </div>
    </div>
  </section>
</template>

<script>
import PortfolioItem from './PortfolioItem.vue'

export default {
  name: 'PortfolioSection',
  components: {
    PortfolioItem
  },
  data() {
    return {
      portfolioItems: [
        {
          id: 1,
          title: 'Productos corporativos',
          description: 'Detalles simples a medida para empresas',
          image: '/seekmake-web/images/examples/corporativa.jpg',
          category: 'Corporativo',
          tags: ['PLA', 'Presición', 'Lotes']
        },
        {
          id: 2,
          title: 'Figuras Decorativas',
          description: 'Diseños personalizados y detallados',
          image: '/seekmake-web/images/examples/Decoracion.jpeg',
          category: 'Decoración',
          tags: ['Detalle', 'Colores', 'Personalizado']
        },
        {
          id: 3,
          title: 'Repuestos y Recambios',
          description: 'Soluciones a medida para cualquier necesidad',
          image: '/seekmake-web/images/examples/repuesto.png',
          category: 'Repuesto',
          tags: ['ABS', 'Durabilidad', 'Funcional']
        }
      ]
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

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.animate-fade-in {
  animation: fade-in 0.8s ease-out;
}
</style>
