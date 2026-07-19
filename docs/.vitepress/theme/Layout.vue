<script setup>
import DefaultTheme from 'vitepress/theme'
import NavLogo from './NavLogo.vue'
const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #nav-bar-title-before>
      <NavLogo />
    </template>
  </Layout>
</template>
