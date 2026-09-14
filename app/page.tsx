import Link from 'next/link';
import styles from './welcome.module.css';

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.copy}>
        <div className={styles.brand}>
          <div className={styles.logoMark}>◒</div>
          <div className={styles.brandText}>
            <strong>ecojoi</strong>
            <span>CRM • SEJA ECO COM ECOJOI</span>
          </div>
        </div>

        <div className={styles.kicker}>PLATAFORMA DE ATENDIMENTO E VENDAS</div>
        <h1>Relacionamentos que<br /><em>geram resultado.</em></h1>
        <p className={styles.lead}>
          Centralize atendimento, contatos, oportunidades e automações em um CRM desenvolvido para uma operação comercial mais ágil, organizada e profissional.
        </p>
        <Link href="/app" className={styles.cta}>Acessar CRM →</Link>

        <div className={styles.benefits}>
          <div className={styles.benefit}><i>✓</i><b>Segurança</b><small>Dados isolados por empresa</small></div>
          <div className={styles.benefit}><i>↗</i><b>Velocidade</b><small>Operação centralizada</small></div>
          <div className={styles.benefit}><i>◇</i><b>Compromisso</b><small>Relacionamento organizado</small></div>
        </div>
        <div className={styles.footer}>TECNOLOGIA PARA NEGÓCIOS MAIS CONSCIENTES</div>
      </section>

      <section className={styles.visual} aria-label="Prévia da interface Ecojoi CRM">
        <div className={styles.laptop}>
          <div className={styles.screen}>
            <div className={styles.screenInner}>
              <div className={styles.top}><span>Ecojoi CRM</span><span>Operação online</span></div>
              <div className={styles.body}>
                <aside className={styles.side}><i /><i /><i /><i /><i /></aside>
                <div className={styles.list}>
                  <div className={styles.search} />
                  <div className={styles.person}><span className={styles.avatar}>CM</span><div><b>Carlos Mendes</b><small>Olá, gostaria de saber mais...</small></div><em>10:42</em></div>
                  <div className={styles.person}><span className={styles.avatar}>MS</span><div><b>Mariana Souza</b><small>Pode me enviar a proposta?</small></div><em>09:18</em></div>
                  <div className={styles.person}><span className={styles.avatar}>RL</span><div><b>Rafael Lima</b><small>Atendimento automático</small></div><em>09:02</em></div>
                </div>
                <div className={styles.chat}>
                  <div className={styles.chatHead}><span>Carlos Mendes</span><span>Online</span></div>
                  <div className={styles.chatThread}>
                    <div className={styles.bubble}>Olá! Quero entender melhor como funciona a solução Ecojoi.</div>
                    <div className={`${styles.bubble} ${styles.bubbleOut}`}>Claro! Posso te ajudar. Qual é a principal necessidade da sua empresa hoje?</div>
                    <div className={styles.bubble}>Preciso organizar meus atendimentos.</div>
                  </div>
                  <div className={styles.composer}>Digite uma mensagem...</div>
                </div>
              </div>
            </div>
          </div>
          <div className={styles.base} />
        </div>

        <div className={styles.metric}><small>Conversão</small><strong>28,4%</strong></div>
        <div className={styles.signature}><div className={styles.logoMark}>◒</div><div><strong>ecojoi</strong><span>SEJA ECO COM ECOJOI</span></div></div>
      </section>
    </main>
  );
}
