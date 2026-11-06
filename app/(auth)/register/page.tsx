import Link from 'next/link';

export default function RegisterPage() {
  return <div className="setup-page">
    <section className="setup-card card">
      <h1>Acesso ao CRM Ecojoi</h1>
      <p>O cadastro de colaboradores é realizado pelo administrador em <strong>Equipe e Permissões</strong>.</p>
      <p>Se você recebeu um convite, abra o link enviado para seu e-mail e defina sua senha. Seu acesso será vinculado automaticamente à empresa Ecojoi, sem criar outra empresa.</p>
      <p>Já tem cadastro, mas não definiu ou esqueceu sua senha? Solicite um novo link pelo formulário de recuperação.</p>
      <p><Link className="btn btn-primary" href="/login">Entrar no CRM</Link></p>
      <p><Link href="/recuperar-senha">Definir ou recuperar senha</Link></p>
    </section>
  </div>;
}
