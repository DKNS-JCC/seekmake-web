<template>
  <div class="portfolio-item group relative rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-3 cursor-pointer">
    <!-- Image container with overlay -->
    <div class="relative h-64 overflow-hidden bg-gray-900">
      <img :src="image" :alt="title" class="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500">
      
      <!-- Overlay -->
      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-12 h-12 text-white mb-2 transform scale-0 group-hover:scale-100 transition-transform duration-500">
          <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.5 5.5a7.5 7.5 0 0 0 10.5 10.5Z" />
        </svg>
        <span class="text-white font-semibold text-sm">Ver más</span>
      </div>

      <!-- Badge -->
      <div class="absolute top-4 right-4 bg-accent/90 backdrop-blur text-white px-3 py-1 rounded-full text-xs font-semibold transform translate-x-20 group-hover:translate-x-0 transition-transform duration-300">
        {{ category }}
      </div>
    </div>

    <!-- Content -->
    <div class="p-6 bg-white dark:bg-gray-700 relative z-10">
      <h3 class="text-xl font-semibold mb-2 dark:text-white group-hover:text-accent transition-colors duration-300">{{ title }}</h3>
      <p class="text-gray-600 dark:text-gray-300 text-sm mb-4">{{ description }}</p>
      
      <!-- Tags -->
      <div class="flex flex-wrap gap-2">
        <span v-for="tag in tags" :key="tag" class="inline-block px-2 py-1 bg-accent/10 text-accent text-xs rounded font-medium">{{ tag }}</span>
      </div>

      <!-- Bottom accent line with animation -->
      <div class="absolute bottom-0 left-0 h-1 w-0 bg-gradient-to-r from-accent to-blue-600 group-hover:w-full transition-all duration-500"></div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'PortfolioItem',
  props: {
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    image: {
      type: String,
      required: true
    },
    category: {
      type: String,
      default: 'Proyecto'
    },
    tags: {
      type: Array,
      default: () => []
    }
  }
}
</script>

<style scoped>
/* Estilos adicionales si es necesario */
</style>
