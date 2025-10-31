<template>
  <section id="presupuesto" class="py-20 bg-gradient-to-br from-primary to-secondary text-white relative overflow-hidden">
    <!-- Animated background -->
    <div class="absolute inset-0 opacity-10">
      <div class="absolute top-0 right-0 w-96 h-96 bg-white rounded-full animate-float"></div>
      <div class="absolute bottom-0 left-0 w-96 h-96 bg-white rounded-full animate-float" style="--animation-delay: 2s"></div>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
      <div class="text-center animate-fade-in-up">
        <h2 class="text-4xl md:text-5xl font-bold mb-4">¿Cuánto cuesta tu idea?</h2>
        <p class="text-lg text-gray-100 max-w-3xl mx-auto mb-12">
          Disponemos de un sistema automatizado de cotización que te permite conocer el precio de tu pieza al instante. Sube tu archivo y recibe tu precio en segundos.
        </p>    
        <a href="#" class="group relative inline-flex items-center gap-2 bg-white text-primary px-10 py-4 rounded-lg font-bold text-lg overflow-hidden hover:scale-105 hover:-translate-y-1 transition-all duration-300">
          <div class="absolute inset-0 bg-gray-100 transform -skew-x-12 group-hover:skew-x-12 transition-transform duration-500 -z-10"></div>
          <span class="relative">Calcular Precio Ahora</span>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 group-hover:translate-x-1 transition-transform">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </a>
      </div>
    </div>
  </section>
</template>

<script>
export default {
  name: 'BudgetSection'
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

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-50px);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 0.8s ease-out;
}

.animate-float {
  animation: float 6s ease-in-out infinite;
}
</style>
