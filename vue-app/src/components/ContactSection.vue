<template>
  <section id="contacto" class="py-20 bg-gray-50 dark:bg-gray-900 relative">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-16 animate-fade-in-up">
        <span class="inline-block px-4 py-2 bg-accent/10 rounded-full border border-accent/30 mb-4">
          <span class="text-accent font-semibold text-sm">📞 Ponte en contacto</span>
        </span>
        <h2 class="text-4xl md:text-5xl font-bold mb-4 dark:text-white">¿Tienes preguntas?</h2>
        <p class="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">Estamos aquí para ayudarte. Contacta con nosotros de la forma más cómoda para ti</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <!-- Contact info -->
        <div class="contact-info space-y-8">
          <div v-for="(contact, index) in contactInfo" :key="contact.id" class="contact-item group flex gap-4 items-start transform hover:translate-x-2 transition-transform duration-300 animate-fade-in-up" :style="{ animationDelay: `${index * 100}ms` }">
            <div class="text-accent text-3xl flex-shrink-0 group-hover:scale-110 transition-transform duration-300" v-html="contact.icon"></div>
            <div>
              <h4 class="font-semibold mb-1 dark:text-white group-hover:text-accent transition-colors">{{ contact.label }}</h4>
              <a v-if="contact.href" :href="contact.href" class="text-accent hover:underline">{{ contact.value }}</a>
              <p v-else class="text-gray-600 dark:text-gray-300">{{ contact.value }}</p>
            </div>
          </div>
        </div>

        <!-- Contact buttons -->
        <div class="animate-fade-in-up" :style="{ '--animation-delay': '300ms' }">
          <ContactForm />
        </div>
      </div>
    </div>
  </section>
</template>

<script>
import ContactForm from './ContactForm.vue'

export default {
  name: 'ContactSection',
  components: {
    ContactForm
  },
  data() {
    return {
      contactInfo: [
        {
          id: 1,
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
          </svg>`,
          label: 'WhatsApp / Llamadas',
          value: '+34 665 14 89 56',
          href: 'tel:+34665148956'
        },
        {
          id: 2,
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>`,
          label: 'Email',
          value: 'impresion3dslmc@gmail.com',
          href: 'mailto:impresion3dslmc@gmail.com'
        },
        {
          id: 3,
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
          </svg>`,
          label: 'Ubicación',
          value: 'Plza. Barrio Vidal, Salamanca 37006, España'
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
</style>
