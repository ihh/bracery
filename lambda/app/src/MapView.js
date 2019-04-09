import React, { Component } from 'react';
import { ParseTree } from 'bracery';
import { extend, fromEntries, cloneDeep } from './bracery-web';
//import GraphView from 'react-digraph';
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
             edges: cloneDeep (this.graph.edges) };
  }

  updateGraph() {
    this.setState (this.graphState());
  }

  setSelected (selected) {
    this.graph.selected = selected;  // setter automatically updates graph selection markers
    this.setState (extend (this.graphState(),
                           { selected },
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
    this.graph.createNode (x, y);
    this.updateGraph();
  }

  canCreateEdge (source, target) {
    return this.graph.canCreateEdge (source, target);
  }

  createEdge (source, target) {
    this.graph.createEdge (source, target);
    this.updateGraph();
  }

  canSwapEdge (source, target, edge) {
    return this.graph.canSwapEdge (source, target, edge);
  }
  
  swapEdge (sourceNode, targetNode, edge) {
    this.graph.swapEdge (sourceNode, targetNode, edge);
    this.setSelected ({ edge: { source: sourceNode.id,
                                target: targetNode.id } });
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
                                  target: edge.target,
                                  link: edge.link } }
                      : {});
  }

  unreachableDeleteNode (selected, nodeId, nodes) {
    console.warn ('deleteNode',{selected,nodeId,nodes})
    console.error ('deleteNode should be unreachable through the UI');
  }

  unreachableDeleteEdge (selectedEdge, edges) {
    console.warn ('deleteEdge',{selectedEdge, edges})
    console.error ('deleteEdge should be unreachable through the UI');
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
            {this.renderNodeEditor()}
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
            canDeleteNode={() => false}
            canDeleteEdge={() => false}
            onDeleteNode={this.unreachableDeleteNode.bind(this)}
            onDeleteEdge={this.unreachableDeleteEdge.bind(this)}
	    zoomLevel="1"
	    />
            </div>);
  }

  renderNodeEditor() {
    return (<div>
            <div className="editorcontainer">
            <NodeEditor
            setEditorState={this.setEditorState.bind(this)}
            content={this.state.editorContent}
            selection={this.state.editorSelection}
            disabled={this.state.editorDisabled}
            focus={this.state.editorFocus} />
            </div>
            <div style={{'fontSize':'small'}}>
            {this.state.text}
            </div>
            </div>);
  }
}

export default MapView;
