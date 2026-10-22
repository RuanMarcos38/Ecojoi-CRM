import type { MetadataRoute } from 'next';

export default function manifest():MetadataRoute.Manifest{
  return {
    name:'CRM Corporativo',
    short_name:'CRM',
    description:'CRM comercial, atendimento e automações.',
    start_url:'/app',
    display:'standalone',
    background_color:'#ffffff',
    theme_color:'#087a4b',
    orientation:'any'
  };
}
