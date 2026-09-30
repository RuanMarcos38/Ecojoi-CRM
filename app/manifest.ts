import type { MetadataRoute } from 'next';
export default function manifest():MetadataRoute.Manifest{
  return {
    name:'Ecojoi CRM',
    short_name:'Ecojoi CRM',
    description:'CRM corporativo para atendimento, vendas e gestão comercial.',
    start_url:'/app',
    display:'standalone',
    background_color:'#ffffff',
    theme_color:'#087a4b',
    lang:'pt-BR',
    icons:[
      {src:'/icon-192.svg',sizes:'192x192',type:'image/svg+xml'},
      {src:'/icon-512.svg',sizes:'512x512',type:'image/svg+xml'}
    ]
  };
}
