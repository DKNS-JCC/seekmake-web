<template>
  <div class="contact-form-container">
    <div class="contact-actions bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg space-y-4 hover:shadow-xl transition-shadow duration-300">
      <!-- Email button -->
      <a href="mailto:impresion3dslmc@gmail.com" 
         class="group flex items-center justify-center gap-3 bg-gradient-to-r from-accent to-blue-600 text-white px-8 py-4 rounded-lg font-semibold hover:shadow-lg transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 w-full overflow-hidden relative"
         title="Enviar email">
        <div class="absolute inset-0 bg-gradient-to-r from-blue-600 to-accent transform -skew-x-12 group-hover:skew-x-12 transition-transform duration-500 -z-10"></div>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 group-hover:rotate-12 transition-transform duration-300">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
        </svg>
        <span class="relative">Enviar email</span>
      </a>

      <!-- Phone button -->
      <a href="tel:+34665148956" 
         class="group flex items-center justify-center gap-3 bg-transparent text-primary dark:text-white border-2 border-primary dark:border-gray-600 px-8 py-4 rounded-lg font-semibold hover:bg-primary hover:text-white dark:hover:bg-gray-700 transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 w-full hover:shadow-lg"
         title="Llamar">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 group-hover:animate-pulse">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
        </svg>
        <span class="relative">Llamar +34 665 14 89 56</span>
      </a>

      <!-- WhatsApp button -->
      <a href="https://wa.me/34665148956?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20impresi%C3%B3n%203D" 
         target="_blank" 
         rel="noopener"
         class="group flex items-center justify-center gap-3 bg-transparent text-accent border-2 border-accent px-8 py-4 rounded-lg font-semibold hover:bg-accent hover:text-white transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 w-full hover:shadow-lg"
         title="WhatsApp">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 group-hover:rotate-12 transition-transform duration-300">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
        <span class="relative">Enviar WhatsApp</span>
      </a>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ContactForm'
}
</script>

<style scoped>
/* Estilos adicionales si es necesario */
</style>
