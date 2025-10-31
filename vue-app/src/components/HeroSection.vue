<template>
  <section id="inicio" class="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 dark:bg-gray-900">
    <!-- Animated background -->
    <div class="absolute inset-0 -z-10 overflow-hidden">
      <img src="/seekmake-web/images/main_banner.png" alt="Impresión 3D" class="w-full h-full object-cover animate-zoom">
      <div class="absolute inset-0 bg-gradient-to-br from-white/90 via-white/80 to-gray-100/85 dark:from-gray-900/90 dark:via-gray-900/85 dark:to-gray-800/90"></div>
      <!-- Floating particles -->
      <div v-for="i in 5" :key="i" class="absolute w-2 h-2 bg-accent rounded-full opacity-20 animate-float" :style="{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, animationDelay: `${i * 0.2}s` }"></div>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
      <div class="text-center max-w-4xl mx-auto animate-fade-in-up">
        <div class="inline-block mb-6 px-4 py-2 bg-accent/10 rounded-full border border-accent/30">
          <span class="text-accent font-semibold text-sm">🚀 Innovación en Impresión 3D</span>
        </div>

        <h1 class="text-5xl md:text-7xl font-extrabold mb-6 leading-tight text-primary dark:text-white drop-shadow-sm animate-slide-in-left">
          <span class="block">Impresión 3DCC</span>
          <span class="block text-transparent bg-clip-text bg-gradient-to-r from-accent to-blue-600">Diseño y Prototipado</span>
        </h1>

        <p class="text-xl md:text-2xl text-gray-700 dark:text-gray-300 mb-10 max-w-3xl mx-auto drop-shadow-sm animate-slide-in-right animation-delay-200">
          Convertimos tus ideas en realidad con precisión y calidad excepcional. Servicio en Salamanca y envíos a toda España.
        </p>

        <div class="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in animation-delay-400">
          <a href="#presupuesto" class="group relative inline-flex items-center justify-center gap-2 bg-accent text-white px-8 py-4 rounded-lg font-semibold text-lg overflow-hidden">
            <div class="absolute inset-0 bg-blue-600 transform -skew-x-12 group-hover:skew-x-12 transition-transform duration-300 -z-10"></div>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
            </svg>
            <span class="relative">Calcular Precio</span>
          </a>
          <a href="#contacto" class="group relative inline-flex items-center justify-center gap-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm text-primary dark:text-white border-2 border-primary dark:border-gray-600 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary hover:text-white dark:hover:bg-gray-700 transition-all duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
            <span class="relative group-hover:translate-x-0.5 transition-transform">Contactar</span>
          </a>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-8 mt-16 pt-8 border-t border-primary/10 dark:border-white/10">
          <div v-for="stat in stats" :key="stat.label" class="animate-fade-in" :style="{ animationDelay: `${stats.indexOf(stat) * 100}ms` }">
            <div class="text-3xl md:text-4xl font-bold text-accent">{{ stat.value }}</div>
            <div class="text-gray-600 dark:text-gray-300 text-sm mt-1">{{ stat.label }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Scroll indicator -->
    <div class="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce">
      <div class="w-6 h-10 border-2 border-primary dark:border-white rounded-full relative bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm">
        <div class="w-1 h-2 bg-primary dark:bg-white rounded-full absolute top-2 left-1/2 -translate-x-1/2 animate-pulse"></div>
      </div>
    </div>
  </section>
</template>

<script>
export default {
  name: 'HeroSection',
  data() {
    return {
      stats: [
        { value: '500+', label: 'Proyectos' },
        { value: '4.8★', label: 'Calificación' },
        { value: '24h', label: 'Entrega' }
      ]
    }
  }
}
</script>

<style scoped>
@keyframes zoom {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.05);
  }
}

@keyframes float {
  0%, 100% {
    transform: translateY(0) translateX(0);
  }
  50% {
    transform: translateY(-20px) translateX(10px);
  }
}

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

@keyframes slide-in-left {
  from {
    opacity: 0;
    transform: translateX(-50px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slide-in-right {
  from {
    opacity: 0;
    transform: translateX(50px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.animate-zoom {
  animation: zoom 20s ease-in-out infinite;
}

.animate-float {
  animation: float 4s ease-in-out infinite;
}

.animate-fade-in-up {
  animation: fade-in-up 0.8s ease-out;
}

.animate-slide-in-left {
  animation: slide-in-left 0.8s ease-out;
}

.animate-slide-in-right {
  animation: slide-in-right 0.8s ease-out;
}

.animation-delay-200 {
  animation-delay: 200ms;
}

.animation-delay-400 {
  animation-delay: 400ms;
}
</style>
