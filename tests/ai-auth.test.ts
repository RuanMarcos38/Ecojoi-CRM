import{describe,it,expect}from'vitest';import{aiTenantToken,verifyAiAuthorization}from'@/lib/server/ai-auth';
describe('autenticação da IA isolada por empresa',()=>{
 const master='master-only-test';
 it('token de uma empresa não responde por outra',()=>{
  const header='Bearer '+aiTenantToken(master,'tenant-a');
  expect(verifyAiAuthorization(header,master,'tenant-a')).toBe(true);expect(verifyAiAuthorization(header,master,'tenant-b')).toBe(false);
 });
 it('token global não é aceito por padrão',()=>{expect(verifyAiAuthorization('Bearer '+master,master,'tenant-a')).toBe(false);});
 it('compatibilidade legada exige vínculo explícito com uma empresa',()=>{
  expect(verifyAiAuthorization('Bearer '+master,master,'tenant-a','tenant-a')).toBe(true);
  expect(verifyAiAuthorization('Bearer '+master,master,'tenant-b','tenant-a')).toBe(false);
 });
 it('derivação é estável e não expõe o segredo mestre',()=>{
  expect(aiTenantToken(master,'tenant-a')).toBe(aiTenantToken(master,'tenant-a'));expect(aiTenantToken(master,'tenant-a')).not.toContain(master);
 });
 it('ausência de autenticação falha fechada',()=>{expect(verifyAiAuthorization(null,master,'tenant-a')).toBe(false);expect(verifyAiAuthorization('Bearer x','','tenant-a')).toBe(false);});
});

