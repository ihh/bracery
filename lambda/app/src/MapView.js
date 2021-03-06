import React, { Component } from 'react';
import { ParseTree } from 'bracery';
import { extend, fromEntries, cloneDeep } from './bracery-web';
import GraphView from './react-digraph/components/graph-view';
import ControlledInput from './ControlledInput';
import ParseGraph from './ParseGraph';

import './MapView.css';

const canonicalStringify = require('canonical-json');

// MapView has a ParseGraph and controls a GraphView & ControlledInput
class MapView extends Component {
  constructor(props) {
    super(props);
    this.ParseTree = ParseTree;
    this.initGraph (props);
    this.state = { text: props.text,
                   nodes: cloneDeep (this.graph.nodes),
                   edges: cloneDeep (this.graph.edges),
                   selected: props.selected,

		   braceryHistory: [],  // undo
		   braceryFuture: [],  // redo
		   
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
  minTimeBetweenSimilarHistoryEvents() { return 400; }  // milliseconds

  // Graph initialization & external update
  initGraph (props) {
    this.graph = new ParseGraph (extend ({}, this.props, props));
  }

  updateGraph (text) {
    this.initGraph ({ text,
		      selected: {} });
    this.setState (extend (this.graphState(),
			   this.disableInputState()));
  }
  
  // State modification
  graphState() {
    return { text: this.graph.bracery(),
             nodes: cloneDeep (this.graph.nodes),
             edges: cloneDeep (this.graph.edges),
             selected: this.graph.selected };
  }

  graphStateForSelection (selected) {
    this.graph.selected = selected;  // setter automatically updates graph selection markers
    return extend ({ renamerContent: '',
                     renamerDisabled: false },
		   this.graphState(),
                   this.graph.getEditorState());
  }

  updateSelection (selected) {
    this.setState (this.graphStateForSelection (selected));
  }

  // setRenamerState is called by the (tightly-controlled) rename input, to update its own state
  setRenamerState (newRenamerState) {
    if (newRenamerState.content)
      newRenamerState.content = newRenamerState.content.toLowerCase().replace(/\s/g,'_').replace(/[^a-z0-9_]/g,'');
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
    const match = (text) => (text.toLowerCase().indexOf(searchText) >= 0);
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
    }, { source: 'editor',
	 selected: this.graph.selected });
  }

  createNode (x, y) {
    this.newHistoryEvent (() => {
      const newNode = this.graph.createNode (x || 0, y || 0);
      return this.graphStateForSelection ({ node: newNode.id });
    });
  }

  canCreateEdge (source, target) {
    return this.graph.canCreateEdge (source, target);
  }

  createEdge (source, target) {
    this.newHistoryEvent (() => {
      this.graph.createEdge (source, target);
      return this.graphStateForSelection ({ edge: { source: source.id,
						    target: target.id } });
    });
  }

  canSwapEdge (source, target, edge) {
    return this.graph.canSwapEdge (source, target, edge);
  }
  
  swapEdge (source, target, edge) {
    this.newHistoryEvent (() => {
      this.graph.swapEdge (source, target, edge);
      return this.graphStateForSelection ({ edge: { source: source.id,
						    target: target.id } });
    });
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
    return this.state.braceryHistory.length > 0;
  }

  canRedo() {
    return this.state.braceryFuture.length > 0;
  }
  
  undo() {
    let history = this.state.braceryHistory, future = this.state.braceryFuture;
    const bracery = this.graph.bracery(), undoEvent = history.pop(), restoredBracery = undoEvent.bracery;
    this.addToHistory (future, bracery);

    this.graph = new ParseGraph ({ text: restoredBracery,
                                   name: this.props.name,
                                   selected: {} });

    this.setState (extend ({ braceryHistory: history,
			     braceryFuture: future },
			   this.graphState(),
			   this.disableInputState()),
		   () => this.props.setText (restoredBracery));
  }

  redo() {
    let history = this.state.braceryHistory, future = this.state.braceryFuture;
    const bracery = this.graph.bracery(), redoEvent = future.pop(), restoredBracery = redoEvent.bracery;
    this.addToHistory (history, bracery);
    
    this.graph = new ParseGraph ({ text: restoredBracery,
                                   name: this.props.name,
                                   selected: {} });
    
    this.setState (extend ({ braceryHistory: history,
			     braceryFuture: future },
			   this.graphState(),
			   this.disableInputState()),
		   () => this.props.setText (restoredBracery));
  }

  disableInputState() {
    return { editorContent: '',
	     editorFocus: false,
	     editorDisabled: true,
	     renamerContent: '',
	     renamerFocus: false,
	     renamerDisabled: true,
	     searchContent: '',
	     searchFocus: false };
	     
  }

  addToHistory (history, bracery, type) {
    const timestamp = Date.now();
    const typeJson = type && canonicalStringify(type);
    const historyEvent = extend ({ bracery },
				 type ? {typeJson,timestamp} : {});
    if (history.length) {
      const lastEvent = history[history.length - 1];
      if (lastEvent.bracery !== bracery) {
	if (type
	    && lastEvent.typeJson === typeJson
	    && lastEvent.timestamp
	    && timestamp < lastEvent.timestamp + this.minTimeBetweenSimilarHistoryEvents())
	  history.pop();
	history.push (historyEvent);
      }
    } else
      history.push (historyEvent);
  }
  
  newHistoryEvent (newStateGetter, type) {
    let history = this.state.braceryHistory;
    const oldBracery = this.graph.bracery();
    const newState = newStateGetter();
    const newBracery = this.graph.bracery();
    if (oldBracery !== newBracery)
      this.addToHistory (history, oldBracery, type);
    if (history.length > this.maxUndos)
      history = history.slice(1);
    this.setState (extend ({ braceryHistory: history,
			     braceryFuture: [] },
			   newState),
		   () => this.props.setText (newBracery));
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
            bidirectionalEdgesAllowed={true}
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
      return theSelectedScene (<span> is defined <button onClick={() => this.props.openSymPage (this.graph.nodeIdToSymbol (node.id))}>
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
}

export default MapView;
