import React, { Component } from 'react';
import { ParseTree } from 'bracery';
import { extend, fromEntries, cloneDeep } from './bracery-web';
import GraphView from './react-digraph/components/graph-view';
import NodeEditor from './NodeEditor';
import ParseGraph from './ParseGraph';

import './MapView.css';

// const canonicalStringify = require('canonical-json');

// MapView has a ParseGraph and controls a GraphView & NodeEditor
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
                   editorContent: '',
                   editorSelection: extend ({}, props.editorSelection),
                   editorFocus: props.editorFocus || false,
                   editorDisabled: props.hasOwnProperty('editorDisabled') ? props.editorDisabled : true,
                 };
  }
  
  // State modification
  graphState() {
    return { text: this.graph.bracery(),
             nodes: cloneDeep (this.graph.nodes),
             edges: cloneDeep (this.graph.edges),
             selected: this.graph.selected };
  }

  updateGraph() {
    this.setState (this.graphState());
  }

  setSelected (selected) {
    this.graph.selected = selected;  // setter automatically updates graph selection markers
    this.setState (extend (this.graphState(),
                           this.graph.getEditorState()));
  }

  // setEditorState is called by the (tightly-controlled) node editor, to update its own state
  // We use this opportunity to update the graph as well
  setEditorState (newEditorState) {
    let graph = this.graph;
    let selectedNode = graph.selectedNode(),
        selectedEdge = graph.selectedEdge();
    let newState = fromEntries (['content','focus','disabled','selection']
                                .filter ((prop) => newEditorState.hasOwnProperty(prop))
                                .map ((prop) => ['editor'+prop[0].toUpperCase()+prop.slice(1),
                                                 newEditorState[prop]]));
    if (newState.hasOwnProperty('editorContent')) {
      if (selectedEdge)
        this.graph.replaceEdgeText (selectedEdge, newState.editorContent);
      else if (selectedNode)
        this.graph.replaceNodeText (selectedNode, newState.editorContent);
      else
        console.error('oops: editor content with no selected node or edge');
    }
    extend (newState, this.graphState());
    this.setState (newState);
  }

  createNode (x, y) {
    const newNode = this.graph.createNode (x || 0, y || 0);
    this.setSelected ({ node: newNode.id });
  }

  canCreateEdge (source, target) {
    return this.graph.canCreateEdge (source, target);
  }

  createEdge (source, target) {
    this.graph.createEdge (source, target);
    this.setSelected ({ edge: { source: source.id,
                                target: target.id } });
  }

  canSwapEdge (source, target, edge) {
    return this.graph.canSwapEdge (source, target, edge);
  }
  
  swapEdge (source, target, edge) {
    this.graph.swapEdge (source, target, edge);
    this.setSelected ({ edge: { source: source.id,
                                target: target.id } });
  }

  updateNode (node) {
    this.graph.updateNodeCoord (node);
    this.updateGraph();
  }

  selectNode (node) {
    this.setSelected (node
                      ? { node: node.id }
                      : {});
  }
  
  selectEdge (edge) {
    this.setSelected (edge
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
    this.graph.deleteNode (selected);
    this.setSelected({});
  }

  deleteEdge (selectedEdge, edges) {
    this.graph.deleteEdges (selectedEdge);
    this.setSelected({});
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

  // Shapes
  nodeTypes() {
    return fromEntries (
      this.state.nodes.map (
        (node) => {
          const nodeClass = node.nodeType + '-node'
                + (node.selected
                   ? ' selected-node'
                   :(node.selectedOutgoingEdge
                     ? ' selected-edge-source-node'
                     :(node.selectedIncomingEdge
                       ? ' selected-edge-target-node'
                       : '')));
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
    return fromEntries (['',this.graph.selectedEdgeTypeSuffix].reduce ((a, selectedSuffix) => a.concat ([
      ['include'+selectedSuffix, {
	shapeId: '#includeEdge'+selectedSuffix,
	shape: (
            <symbol viewBox="0 0 60 60" id={'includeEdgeHandle'+selectedSuffix} key="0">
            </symbol>
	)
      }],
      ['link'+selectedSuffix, {
	shapeId: '#linkEdge'+selectedSuffix,
	shape: (
            <symbol viewBox="0 0 60 60" id={'linkEdge'+selectedSuffix} key="1">
            <ellipse cx="22" cy="30" rx="10" ry="8" className={'linkEdgeHandle'+selectedSuffix}></ellipse>
            <ellipse cx="38" cy="30" rx="10" ry="8" className={'linkEdgeHandle'+selectedSuffix}></ellipse>
            <ellipse cx="22" cy="30" rx="10" ry="8" className={'linkEdgeHandle'+selectedSuffix} style={{fill:'none'}}></ellipse>
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
            {this.renderNodeEditor()}
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
	    zoomLevel="1"
            ignoreKeyboardEvents={true}
	    />
            </div>);
  }

  renderEditorBanner() {
    const selected = this.state.selected;
    if (selected.node) {
      return (<div className="editor-banner editor-banner-node">
              {this.nodeBanner (this.graph.selectedNode(selected))}
              </div>);
    } else if (selected.edge) {
      return (<div className="editor-banner editor-banner-edge">
              {this.edgeBanner (this.graph.selectedEdge(selected))}
              </div>);
    }
    return (<div className="editor-banner editor-banner-no-selection"></div>);
  }

  makeNodeSelector (id, alt, text) {
    text = text || this.graph.titleForID (id, alt);
    return (<button onClick={() => this.setSelected ({ node: id })}>{text}</button>);
  }
  
  nodeBanner (node) {
    const theSelectedScene = (info) => (<span>The selected scene ({this.graph.titleForID (node.id)}) {info}</span>);
    switch (node.nodeType) {
    case this.graph.externalNodeType:
      return theSelectedScene (<span><span>is defined on another page. You can </span>
                       <button onClick={() => this.props.openSymPage (this.graph.removeSymPrefix (node.id))}>
                       view or edit</button> it there.</span>);
    case this.graph.startNodeType:
      return theSelectedScene ('is the first scene. You can edit it below:');
    case this.graph.placeholderNodeType:
      return theSelectedScene ('has no definition yet. You can start it below:');
    case this.graph.implicitNodeType:
      return (<span>The selected scene is unnamed (it is part of {this.makeNodeSelector (node.topLevelAncestorID)}). You can edit it below:</span>);
    default:
      return theSelectedScene (node.defText
                       ? 'can be edited below:'
                       : 'has no text yet. You can start it below:');
    }
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

  renderNodeEditor() {
    return (<div className="editor-container">
            <NodeEditor
            setEditorState={this.setEditorState.bind(this)}
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
