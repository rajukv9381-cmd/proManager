import { Component } from 'react';

export default class FeatureErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Could not display project view:', error);
  }

  render() {
    if (this.state.failed) {
      return <div className="alert" role="alert">Could not load this view. Check your connection and reload the page.<button className="link" onClick={() => window.location.reload()}>Reload</button></div>;
    }
    return this.props.children;
  }
}
