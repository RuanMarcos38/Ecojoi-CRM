'use client';

import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

type Props={
  children:ReactNode;
  label?:string;
  compact?:boolean;
};

type State={hasError:boolean;message:string};

export class ClientErrorBoundary extends Component<Props,State>{
  state:State={hasError:false,message:''};

  static getDerivedStateFromError(error:unknown):State{
    return {
      hasError:true,
      message:error instanceof Error?error.message:'Erro inesperado de interface.'
    };
  }

  componentDidCatch(error:unknown,info:ErrorInfo){
    console.error('[Ecojoi CRM] UI boundary',error,info.componentStack);
  }

  reset=()=>this.setState({hasError:false,message:''});

  render(){
    if(!this.state.hasError)return this.props.children;

    if(this.props.compact){
      return <div style={{padding:10,fontSize:11,color:'#6b756f'}}>
        {this.props.label??'Módulo'} temporariamente indisponível.
        <button type="button" onClick={this.reset} style={{marginLeft:8,border:0,background:'transparent',textDecoration:'underline',cursor:'pointer'}}>Tentar novamente</button>
      </div>;
    }

    return <div className="content">
      <div className="card section">
        <h3>{this.props.label??'Módulo'} temporariamente indisponível</h3>
        <p className="muted">O restante do CRM continua disponível. Tente carregar este módulo novamente.</p>
        <button className="btn btn-primary" type="button" onClick={this.reset}>Tentar novamente</button>
      </div>
    </div>;
  }
}
