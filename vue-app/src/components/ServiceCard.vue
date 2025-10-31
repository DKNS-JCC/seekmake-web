<template>
  <div class="service-card group relative bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 p-8 rounded-xl overflow-hidden hover:-translate-y-3 transition-all duration-300 hover:shadow-2xl cursor-pointer" @mouseenter="hovered = true" @mouseleave="hovered = false">
    <!-- Background animation -->
    <div class="absolute inset-0 bg-gradient-to-r from-accent/0 via-accent/5 to-accent/0 group-hover:from-accent/10 group-hover:via-accent/20 group-hover:to-accent/10 transition-all duration-300"></div>

    <!-- Card content -->
    <div class="relative z-10 text-center">
      <!-- Icon with animation -->
      <div class="text-accent text-5xl mb-4 flex justify-center transform group-hover:scale-110 group-hover:rotate-12 transition-all duration-300" v-html="icon"></div>

      <!-- Title -->
      <h3 class="text-xl font-semibold mb-3 dark:text-white group-hover:text-accent transition-colors duration-300">{{ title }}</h3>

      <!-- Description -->
      <p class="text-gray-600 dark:text-gray-300 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors duration-300">{{ description }}</p>

      <!-- Hover indicator -->
      <div v-if="hovered" class="mt-4 inline-flex items-center gap-2 text-accent font-semibold text-sm animate-fade-in">
        <span>Saber más</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 group-hover:translate-x-1 transition-transform">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
        </svg>
      </div>
    </div>

    <!-- Border accent -->
    <div class="absolute bottom-0 left-0 w-0 h-1 bg-gradient-to-r from-accent to-blue-600 group-hover:w-full transition-all duration-500"></div>
  </div>
</template>

<script>
export default {
  name: 'ServiceCard',
  props: {
    icon: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      hovered: false
    }
  }
}
</script>

<style scoped>
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateX(-5px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}
</style>
