import React, { Component } from 'react';

// ControlledInput
// Based on https://hashnode.com/post/tightly-controlled-textareas-building-solid-plain-text-editors-in-react-cj6yvu6yq00cls5wtrbbkw96d
// props must include a setInputState method that takes as sole argument an object of the form { content, selection, focus, disabled }
class ControlledInput extends Component {
  constructor(props) {
    super(props);
    this.selectionUpdateEvents = [
      'select',
      'click',
      'focus',
      'keyup'
    ];
  }

  selectionUpdateListener = () => this.props.setInputState(
    { selection: this.getSelection(this.element) }
  );

  focusListener = () => this.props.setInputState ({ focus: true });
  blurListener = () => this.props.setInputState ({ focus: false });
  
  getSelection = (elementRef) => ({
    startOffset: elementRef.selectionStart,
    endOffset: elementRef.selectionEnd,
  });

  setSelectionToDOM = (elementRef, selection) => {
    elementRef.selectionStart = selection.startOffset;
    elementRef.selectionEnd = selection.endOffset;
  }

  setSelectionAndFocus = () => {  
    this.setSelectionToDOM (this.element, this.props.selection);
    if (this.props.focus) {
      this.removeFocusListeners();
      this.element.focus();
      this.addFocusListeners();
    }
  }

  addFocusListeners() {
    this.element.addEventListener ('focus', this.focusListener);
    this.element.addEventListener ('blur', this.blurListener);
  }

  removeFocusListeners() {
    this.element.removeEventListener ('focus', this.focusListener);
    this.element.removeEventListener ('blur', this.blurListener);
  }
  
  componentDidMount() {
    this.setSelectionAndFocus();
    this.selectionUpdateEvents.forEach(
      eventType => this.element.addEventListener(
        eventType,
        this.selectionUpdateListener
      )
    );
    this.addFocusListeners();
  }

  componentWillUnmount() {
    this.selectionUpdateEvents.forEach(
      eventType => this.element.removeEventListener(
        eventType,
        this.selectionUpdateListener
      )
    );
    this.removeFocusListeners();
  }

  componentDidUpdate() {
    this.setSelectionAndFocus();
  }

  onChange = () => this.updateElement({
    content: this.element.value,
    selection: this.getSelection(this.element)
  });

  updateElement = ({ content, selection }) => {
    this.props.setInputState(
      { content, selection },
      () => this.setSelectionToDOM(
        this.element,
        selection
      )
    );
  }

  render() {
    const baseClassName = this.props.className || ('controlled-' + this.props.elementType);
    const className = baseClassName + ' ' + (this.props.disabled
					     ? (this.props.disabledClassName || (baseClassName + '-disabled'))
					     : (this.props.enabledClassName || (baseClassName + '-enabled')));
    return React.createElement (
      this.props.elementType,
      { ref: c => { this.element = c; },
	className: className,
	placeholder: this.props.placeholder,
	value: this.props.content,
	disabled: this.props.disabled,
	onChange: this.onChange });
  }
}

export default ControlledInput;
