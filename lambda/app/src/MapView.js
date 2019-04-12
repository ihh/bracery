import React, { Component } from 'react';
import { ParseTree } from 'bracery';
import { extend, fromEntries, cloneDeep } from './bracery-web';
import GraphView from './react-digraph/components/graph-view';
import ControlledInput from './ControlledInput';
import ParseGraph from './ParseGraph';

import './MapView.css';

// const canonicalStringify = require('canonical-json');

// MapView has a ParseGraph and controls a GraphView & ControlledInput
class MapView extends Component {
  constructor(props) {
    super(props);
    this.ParseTree = ParseTree;
    this.graph = new ParseGraph ({ text: props.text,
                                   rhs: props.rhs,
                                   name: props.name,
                                   selected: props.selected });
    console.warn(this.graph.state);
    this.state = { text: props.text,
                   nodes: cloneDeep (this.graph.nodes),
                   edges: cloneDeep (this.graph.edges),
                   selected: props.selected,

		   history: [],  // undo
		   historyPopped: [],  // redo
		   
                   editorContent: '',
                   editorSelection: extend ({}, props.editorSelection),
                   editorFocus: props.editorFocus || false,
                   editorDisabled: props.hasOwnProperty('editorDisabled') ? props.editorDisabled : true,

		   searchContent: '',
		   searchSelection: {},
		   searchFocus: false,
		   searchDisabled: false,

		   renamerContent: '',
		   renamerSelection: {},
		   renamerFocus: false,
		   renamerDisabled: false,
                 };
  }

  // Constants
  maxUndos() { return 1024; }  // nice deep undo history
  
  // State modification
  graphState() {
    return { text: this.graph.bracery(),
             nodes: cloneDeep (this.graph.nodes),
             edges: cloneDeep (this.graph.edges),
             selected: this.graph.selected };
  }

  graphStateForSelection (selected) {
    this.graph.selected = selected;  // setter automatically updates graph selection markers
    return extend ({ renamerContent: '' },
		   this.graphState(),
                   this.graph.getEditorState());
  }

  updateGraph() {
    this.setState (this.graphState());
  }

  updateSelection (selected) {
    this.setState (this.graphStateForSelection (selected));
  }

  // setRenamerState is called by the (tightly-controlled) rename input, to update its own state
  setRenamerState (newRenamerState) {
    const newState = this.prependInputName (newRenamerState, 'renamer');
    this.setState (newState);
  }

  // setSearchState is called by the (tightly-controlled) search input, to update its own state
  setSearchState (newSearchState) {
    const newState = this.prependInputName (newSearchState, 'search');
    this.highlightMatches (newState.searchContent);
    this.setState (extend (newState, this.graphState()));
  }

  highlightMatches (searchText) {
    searchText = (searchText || this.state.searchContent).toLowerCase();
    const match = (text) => { console.warn(searchText,text);return (text.toLowerCase().indexOf(searchText) >= 0);
			    };
    if (searchText)
      this.graph.markHighlighted ((node, text, nodeByID) => (match(text)
							     || (node.nodeType !== this.graph.implicitNodeType
								 && match (this.graph.titleForNode(node)))),
				  (edge, text, nodeByID) => match (text));
    else
      this.graph.clearHighlighted();
  }

  prependInputName (state, prefix) {
    return fromEntries (['content','focus','disabled','selection']
                        .filter ((prop) => state.hasOwnProperty(prop))
                        .map ((prop) => [prefix+prop[0].toUpperCase()+prop.slice(1),
                                         state[prop]]));
  }
  
  // setEditorState is called by the (tightly-controlled) node editor, to update its own state
  // We use this opportunity to update the graph as well
  setEditorState (newEditorState) {
    this.newHistoryEvent (() => {
      let graph = this.graph;
      let selectedNode = graph.selectedNode(),
          selectedEdge = graph.selectedEdge();
      let newState = this.prependInputName (newEditorState, 'editor');
      if (newState.hasOwnProperty('editorContent')) {
	if (selectedEdge)
          this.graph.replaceEdgeText (selectedEdge, newState.editorContent);
	else if (selectedNode)
          this.graph.replaceNodeText (selectedNode, newState.editorContent);
	else
          console.error('oops: editor content with no selected node or edge');
      }
      return extend (newState, this.graphState());
    });
  }

  createNode (x, y) {
    const newNode = this.graph.createNode (x || 0, y || 0);
    this.updateSelection ({ node: newNode.id });
  }

  canCreateEdge (source, target) {
    return this.graph.canCreateEdge (source, target);
  }

  createEdge (source, target) {
    this.graph.createEdge (source, target);
    this.updateSelection ({ edge: { source: source.id,
                                    target: target.id } });
  }

  canSwapEdge (source, target, edge) {
    return this.graph.canSwapEdge (source, target, edge);
  }
  
  swapEdge (source, target, edge) {
    this.graph.swapEdge (source, target, edge);
    this.updateSelection ({ edge: { source: source.id,
                                    target: target.id } });
  }

  updateNode (node) {
    this.newHistoryEvent (() => {
      this.graph.updateNodeCoord (node);
      return this.graphState();
    });
  }

  selectNode (node) {
    this.updateSelection (node
			  ? { node: node.id }
			  : {});
  }
  
  selectEdge (edge) {
    this.updateSelection (edge
			  ? { edge: { source: edge.source,
                                      target: edge.target } }
			  : {});
  }

  canDeleteNode (selected) {
    return this.graph.canDeleteNode (selected);
  }

  canDeleteEdge (selected) {
    return this.graph.canDeleteEdge (selected);
  }
  
  deleteNode (selected, nodeId, nodes) {
    this.newHistoryEvent (() => {
      this.graph.deleteNode (selected);
      return this.graphStateForSelection({});
    });
  }

  deleteEdge (selectedEdge, edges) {
    this.newHistoryEvent (() => {
      this.graph.deleteEdges (selectedEdge);
      return this.graphStateForSelection({});
    });
  }

  canRenameNode (oldID, newID) {
    return this.graph.canRenameNode (oldID, newID);
  }
  
  renameNode (oldID, newID) {
    this.newHistoryEvent (() => {
      this.graph.renameNode (oldID, newID);
      return extend ({ renamerContent: '' },
		     this.graphState());
    });
  }
  
  assertSelectionValid() {
    if (this.props && this.props.selected) {
      if (this.props.selected.node && !this.graph.selectedNode (this.props.selected))
        console.error("Lost selected.node",this.props.selected.node);
      if (this.props.selected.edge && !this.graph.selectedEdge (this.props.selected))
        console.error("Lost selected.edge",this.props.selected.edge);
    } else
      throw new Error ('no props.selected');
  }

  canUndo() {
    return this.state.history.length > 0;
  }

  canRedo() {
    return this.state.historyPopped.length > 0;
  }
  
  undo() {
    // WRITE ME
  }

  redo() {
    // WRITE ME
  }

  newHistoryEvent (newStateGetter) {
    let history = this.state.history;
    const bracery = this.graph.bracery();
    if (!history.length || history[history.length-1] !== bracery)
      history.push (bracery);
    if (history.length > this.maxUndos)
      history = history.slice(1);
    console.warn(history);
    this.setState (extend ({ history }, newStateGetter()));
  }

  // Shapes
  nodeTypes() {
    return fromEntries (
      this.state.nodes.map (
        (node) => {
          const nodeClass = node.nodeType + '-node'
                + ((node.nodeType === this.graph.externalNodeType || node.defText) ? '' : ' empty-node')
                + (node.selected
                   ? ' selected-node'
                   :(node.selectedOutgoingEdge
                     ? ' selected-edge-source-node'
                     :(node.selectedIncomingEdge
                       ? ' selected-edge-target-node'
                       : '')))
		+ (node.highlighted
		   ? ' highlighted-node'
		   : '');
          return [
            node.type,
            ({ shapeId: '#' + node.type,
               typeText: node.styleInfo.typeText,
	       shape: (node.nodeType === this.graph.implicitNodeType
                       ? (
                           <symbol viewBox="0 0 150 60" id={node.type} key="0">
                           <rect x="0" y="10" width="150" height="40" style={{fill:'none',stroke:'none'}}></rect>
                           <rect x="0" y="10" width="80" height="40" className={nodeClass}></rect>
                           <rect x="70" y="10" width="80" height="40" className={nodeClass}></rect>
                           <rect x="0" y="10" width="80" height="40" className={nodeClass} style={{stroke:'none'}}></rect>
                           <rect x="70" y="10" width="80" height="40" className={nodeClass} style={{stroke:'none'}}></rect>
                           </symbol>
	               )
                       : (
                           <symbol viewBox="0 0 150 60" id={node.type} key="0">
                           <rect x="0" y="0" width="150" height="60" className={nodeClass}></rect>
                           </symbol>
	               ))
             })];
        }));
  }

  edgeTypes() {
    return fromEntries (
      ['', this.graph.highlightedEdgeTypeSuffix]
	.reduce ((arr, highlightSuffix) => arr.concat (
	  ['', this.graph.selectedEdgeTypeSuffix]
	    .map ((selectSuffix) => highlightSuffix + selectSuffix)),
		 [])
	.reduce ((a, highlightSelectSuffix) => a.concat ([
	  ['include'+highlightSelectSuffix, {
	    shapeId: '#includeEdge'+highlightSelectSuffix,
	    shape: (
		<symbol viewBox="0 0 60 60" id={'includeEdgeHandle'+highlightSelectSuffix} key="0">
		</symbol>
	    )
	  }],
	  ['link'+highlightSelectSuffix, {
	    shapeId: '#linkEdge'+highlightSelectSuffix,
	    shape: (
		<symbol viewBox="0 0 60 60" id={'linkEdge'+highlightSelectSuffix} key="1">
		<ellipse cx="22" cy="30" rx="10" ry="8" className={'linkEdgeHandle'+highlightSelectSuffix}></ellipse>
		<ellipse cx="38" cy="30" rx="10" ry="8" className={'linkEdgeHandle'+highlightSelectSuffix}></ellipse>
		<ellipse cx="22" cy="30" rx="10" ry="8" className={'linkEdgeHandle'+highlightSelectSuffix} style={{fill:'none'}}></ellipse>
		</symbol>
	    )
	  }]]), []));
  }
  
  // Render graph
  render() {
    this.assertSelectionValid();
    return (<div>
            {this.renderGraphView()}
            {this.renderEditorBanner()}
            {this.renderEditor()}
            {this.renderCurrentText()}
            </div>);
  }

  renderGraphView() {
    return (<div className="mapview">
	    <GraphView
            nodeKey="id"
	    nodes={this.state.nodes}
	    edges={this.state.edges}
	    edgeTypes={this.edgeTypes()}
	    nodeTypes={this.nodeTypes()}
	    nodeSubtypes={{}}
            selected={this.state.selected && (this.state.selected.node || this.state.selected.edge)}
            nodeSize={this.graph.nodeSize}
            edgeHandleSize={this.graph.edgeHandleSize}
            edgeArrowSize={this.graph.edgeArrowSize}
            onUpdateNode={this.updateNode.bind(this)}
            onSelectNode={this.selectNode.bind(this)}
            onSelectEdge={this.selectEdge.bind(this)}
            onCreateNode={this.createNode.bind(this)}
            onCreateEdge={this.createEdge.bind(this)}
            onSwapEdge={this.swapEdge.bind(this)}
            canSwapEdge={this.canSwapEdge.bind(this)}
            canCreateEdge={this.canCreateEdge.bind(this)}
            canDeleteNode={this.canDeleteNode.bind(this)}
            canDeleteEdge={this.canDeleteEdge.bind(this)}
            onDeleteNode={this.deleteNode.bind(this)}
            onDeleteEdge={this.deleteEdge.bind(this)}
	    canUndo={this.canUndo()}
	    onUndo={this.undo.bind(this)}
	    canRedo={this.canRedo()}
	    onRedo={this.redo.bind(this)}
	    zoomLevel="1"
            ignoreKeyboardEvents={true}
	    renderSearch={this.renderSearchBox.bind(this)}
	    />
            </div>);
  }

  renderSearchBox() {
    return (<div className="search-container">
            <ControlledInput
	    placeholder={this.state.searchDisabled?'':'Search...'}
	    elementType="input"
	    className="search"
            setInputState={this.setSearchState.bind(this)}
            content={this.state.searchContent}
            selection={this.state.searchSelection}
            disabled={this.state.searchDisabled}
            focus={this.state.searchFocus} />
            </div>);
  }
  
  renderEditorBanner() {
    const selected = this.state.selected;
    if (selected.node) {
      const node = this.graph.selectedNode (selected);
      return (<div className="editor-banner editor-banner-node">
              {this.nodeBanner (node)}
              {this.nodeRenamer (node)}
              </div>);
    } else if (selected.edge) {
      const edge = this.graph.selectedEdge (selected);
      return (<div className="editor-banner editor-banner-edge">
              {this.edgeBanner (edge)}
              </div>);
    }
    return (<div className="editor-banner editor-banner-no-selection"></div>);
  }

  makeNodeSelector (id, alt, text) {
    text = text || this.graph.titleForID (id, alt);
    return (<button onClick={() => this.updateSelection ({ node: id })}>{text}</button>);
  }
  
  nodeBanner (node) {
    //    const theSelectedScene = (info) => (<span>The selected scene ({this.graph.titleForID (node.id)}) {info}</span>);
    const theSelectedScene = (info) => (<span>{ this.graph.titleForID(node.id) }{ info || '' }</span>);
    switch (node.nodeType) {
    case this.graph.externalNodeType:
      return theSelectedScene (<span> is defined <button onClick={() => this.props.openSymPage (this.graph.removeSymPrefix (node.id))}>
			       elsewhere
			       </button></span>);
    case this.graph.startNodeType:
      return theSelectedScene(' is the opening scene');
    case this.graph.placeholderNodeType:
      return theSelectedScene();
    case this.graph.implicitNodeType:
      return (<span>Scene (part of {this.makeNodeSelector (node.topLevelAncestorID)})</span>);
    default:
      return theSelectedScene();
    }
  }

  nodeRenamer (node) {
    return this.graph.canRenameNode (node.id)
      && (<span className="renamer-container">
          <ControlledInput
	  placeholder={this.state.renamerDisabled?'':'Rename'}
	  elementType="input"
	  className="renamer"
          setInputState={this.setRenamerState.bind(this)}
          content={this.state.renamerContent}
          selection={this.state.renamerSelection}
          disabled={this.state.renamerDisabled}
          focus={this.state.renamerFocus} />
	  {this.state.renamerContent
	   && (this.graph.canRenameNode (node.id, this.state.renamerContent)
	       ? (<button onClick={() => this.renameNode (node.id, this.state.renamerContent)}>Rename</button>)
	       : (<span className="renamer-warning">This name is already in use.</span>))}
	  </span>);
    
  }

  edgeBanner (edge) {
    const isLink = edge.edgeType === this.graph.linkEdgeType;
    return (<span>
            A scene ({this.makeNodeSelector (edge.source, 'unnamed')})
            {isLink
             ? ' links to '
             : ' includes '}
            {this.makeNodeSelector (edge.target, 'an unnamed scene')}
            {isLink
             ? ' with the following link text'
             : ('. The full definition of ' + this.graph.titleForID (edge.source, 'the first scene') + ' is')}:
            </span>);
  }

  renderEditor() {
    return (<div className="editor-container">
            <ControlledInput
	    placeholder={this.state.editorDisabled?'':'Enter text...'}
	    elementType="textarea"
	    className="editor"
            setInputState={this.setEditorState.bind(this)}
            content={this.state.editorContent}
            selection={this.state.editorSelection}
            disabled={this.state.editorDisabled}
            focus={this.state.editorFocus} />
            </div>);
  }

  renderCurrentText() {
    return (<div style={{'fontSize':'small'}}>
            {this.state.text}
            </div>)
  }
}

export default MapView;
