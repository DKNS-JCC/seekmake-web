<template>
  <div id="app" class="app-container">
    <header>
      <h1>3DCC - Vue.js Migration</h1>
      <p>Reconstruyendo la página web con Vue.js</p>
    </header>
    
    <main>
      <section class="welcome">
        <h2>Bienvenido</h2>
        <p>Este es el inicio de la migración a Vue.js</p>
      </section>
    </main>
    
    <footer>
      <p>&copy; 2025 3DCC. Todos los derechos reservados.</p>
    </footer>
  </div>
</template>

<script>
export default {
  name: 'App',
  data() {
    return {
      message: 'Proyecto Vue.js para 3DCC'
    }
  }
}
</script>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: Arial, sans-serif;
  line-height: 1.6;
  color: #333;
}

.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem;
  text-align: center;
}

header h1 {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

header p {
  font-size: 1.1rem;
  opacity: 0.9;
}

main {
  flex: 1;
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.welcome {
  background: #f5f5f5;
  padding: 2rem;
  border-radius: 8px;
  margin-bottom: 2rem;
}

.welcome h2 {
  margin-bottom: 1rem;
  color: #667eea;
}

footer {
  background: #333;
  color: white;
  text-align: center;
  padding: 1.5rem;
  margin-top: 2rem;
}

@media (max-width: 768px) {
  header h1 {
    font-size: 1.8rem;
  }
  
  main {
    padding: 1rem;
  }
}
</style>
