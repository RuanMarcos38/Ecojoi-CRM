import Link from 'next/link';
import {
  ArrowRight,
  Gauge,
  Leaf,
  ShieldCheck,
  UsersRound,
  Workflow
} from 'lucide-react';
import styles from './welcome.module.css';

const features = [
  {
    icon: UsersRound,
    title: 'Clientes e contatos',
    description: 'Centralize contatos, histórico e informações comerciais em um único ambiente.'
  },
  {
    icon: Workflow,
    title: 'Oportunidades',
    description: 'Organize sua operação comercial e acompanhe cada oportunidade com clareza.'
  },
  {
    icon: Gauge,
    title: 'Atendimento ágil',
    description: 'Ganhe velocidade no atendimento com uma operação centralizada e organizada.'
  },
  {
    icon: ShieldCheck,
    title: 'Multiempresa seguro',
    description: 'Dados isolados por empresa, com segurança e organização para cada operação.'
  }
];

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logoMark} aria-hidden="true">
            <Leaf size={22} strokeWidth={2.1} />
          </span>
          <div className={styles.brandText}>
            <strong>ecojoi</strong>
            <span>CRM • SEJA ECO COM ECOJOI</span>
          </div>
        </div>

        <Link href="/login" className={styles.loginButton}>
          Entrar
        </Link>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <span className={styles.badge}>CRM multiempresa</span>
          <h1>
            Relacionamentos que <span>geram resultado.</span>
          </h1>
          <p>
            Centralize atendimento, contatos, oportunidades e automações em um CRM desenvolvido
            para uma operação comercial mais ágil, organizada e profissional.
          </p>
          <Link href="/login" className={styles.primaryButton}>
            Acessar CRM
            <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" />
          </Link>
        </section>

        <section className={styles.features} aria-label="Recursos principais do Ecojoi CRM">
          {features.map(({ icon: Icon, title, description }) => (
            <article className={styles.featureCard} key={title}>
              <span className={styles.featureIcon} aria-hidden="true">
                <Icon size={22} strokeWidth={2} />
              </span>
              <h2>{title}</h2>
              <p>{description}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
