import React, { Component } from 'react';
import { ParseTree } from 'bracery';
import { extend, fromEntries, cloneDeep } from './bracery-web';
//import GraphView from 'react-digraph';
import GraphView from './react-digraph/components/graph-view';
import NodeEditor from './NodeEditor';
import ParseGraph from './ParseGraph';

import './MapView.css';

const canonicalStringify = require('canonical-json');

// MapView
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
    return new Promise ((resolve) =>
                        this.setState (this.graphState(),
                                       resolve));
  }

  setSelected (selected) {
    let graph = this.graph;
    let editorContent = '', editorSelection = null;
    const nodeByID = graph.getNodesByID();
    if (selected.edge) {
      const selectedEdge = graph.selectedEdge (selected);
      const selectedSource = graph.selectedEdgeSourceNode (selected);
      editorContent = (selectedEdge.edgeType === graph.linkEdgeType
                       ? graph.edgeText (nodeByID, selectedEdge)
                       : graph.selectedNodeText (selected, selectedSource));
      if (selectedEdge.edgeType === graph.includeEdgeType)
        editorSelection = graph.calculateSelectionRange (selectedEdge.pos);
    } else if (selected.node)
      editorContent = graph.selectedNodeText (selected);
    editorSelection = editorSelection || { startOffset: editorContent.length,
                                           endOffset: editorContent.length };
    const editorDisabled = !(selected.node || selected.edge)
          || (selected.node && graph.selectedNode(selected).nodeType === graph.externalNodeType);
    this.graph.selected = selected;
//    console.warn(selected,graph.selectedNode(selected),editorContent);
    this.setState (extend (this.graphState(),
                           { selected,
                             editorContent,
                             editorSelection,
                             editorDisabled,
                             editorFocus: ((selected.node || selected.edge) && !editorDisabled)
                           }));
  }

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
    let graph = this.graph;
    const id = this.newVar (graph.isVarName);
    let newNode = { id: id,
                    x: Math.round(x),
                    y: Math.round(y),
                    type: graph.definedNodeType,
                    nodeType: graph.definedNodeType,
                    typeText: ParseTree.traceryChar + id + ParseTree.traceryChar,
                    title: this.emptyNodeText,
                    rhs: [] };
    graph.nodes.push (newNode);
    const newEvalText = graph.bracery();
/*
    this.props.setAppState ({ mapSelection: { node: id },
                              editorContent: '',
                              editorSelection: { startOffset: 0, endOffset: 0 },
                              editorDisabled: false,
                              editorFocus: true,
                              evalText: newEvalText });
*/
  }

  createEdge (source, target) {
    let graph = this.graph;
    let newSource = graph.findNodeByID (graph, source.id);
    let newEdge = { source: source.id,
		    target: target.id,
                    type: graph.linkEdgeType };
    this.addEdge (graph.edges, newEdge);

    let link = null, linkText = null;
    if (target.nodeType === graph.externalNodeType) {
      linkText = target.id.replace(graph.SYM_PREFIX,'');
      link = this.makeLinkBracery (null, linkText, ParseTree.symChar + linkText);
    } else
      link = '[[' + (linkText = target.id) + ']]';
    newSource.rhs = [this.implicitBracery (graph, newSource) + link];
    
    const newEvalText = graph.bracery();

/*
    this.props.setAppState ({ mapSelection: { edge: { source: source.id,
						      target: target.id } },
                              editorContent: linkText,
                              editorSelection: { startOffset: linkText.length, endOffset: linkText.length },
                              editorDisabled: false,
                              editorFocus: true,
                              evalText: newEvalText });
*/    
  }
  
  swapEdge (sourceNode, targetNode, edge) {
    let graph = this.graph;
    const newTargetText = this.makeLinkTargetBracery (targetNode);
    const newEvalText = (edge.edgeType === graph.includeEdgeType
                         ? this.replaceText (graph.text,
                                             [{ startOffset: edge.pos[0],
                                                endOffset: edge.pos[0] + edge.pos[1],
                                                replacementText: newTargetText }])
                         : this.replaceLink (graph.findNodeByID (edge.link), edge.pos, undefined, newTargetText));

    /*
    this.props.setAppState ({ evalText: newEvalText,
                              mapSelection: {},
                              editorContent: '',
                              editorSelection: { startOffset: 0, endOffset: 0 },
                              editorDisabled: true,
                              editorFocus: false });
    */
  }

  // Event handlers
  eventHandlers() {
    return {
      onCreateNode: (x, y, event) => {
//        console.warn ('onCreateNode',{x,y,event});
        this.createNode (x, y);
      },
      onDeleteNode: (selected, nodeId, nodes) => {
        console.warn ('onDeleteNode',{selected,nodeId,nodes})
	console.error ('onDeleteNode should be unreachable through the UI');
      },
      onCreateEdge: (sourceNode, targetNode) => {
//        console.warn ('onCreateEdge',{sourceNode, targetNode})
	this.createEdge (sourceNode, targetNode);
      },
      canSwapEdge: (sourceNode, targetNode, edge) => {
//        console.warn ('canSwapEdge',{sourceNode, targetNode, edge})
        return targetNode.nodeType !== this.graph.implicitNodeType;
      },
      onSwapEdge: (sourceNode, targetNode, edge) => {
//        console.warn ('onSwapEdge',{sourceNode, targetNode, edge})
        this.swapEdge (sourceNode, targetNode, edge);
      },
      onDeleteEdge: (selectedEdge, edges) => {
        console.warn ('onDeleteEdge',{selectedEdge, edges})
	console.error ('onDeleteEdge should be unreachable through the UI');
      },
      canDeleteNode: (selected) => {
//        console.warn ('canDeleteNode',{selected})
	return false;
      },
      canCreateEdge: (sourceNode, targetNode) => {
//        console.warn ('canCreateEdge',{sourceNode, targetNode})
        if (!targetNode) {
	  sourceNode = typeof(sourceNode) === 'object' ? sourceNode : this.findNodeByID (sourceNode);
	  return sourceNode && sourceNode.nodeType !== this.graph.placeholderNodeType;
	}
	return targetNode.nodeType !== this.graph.implicitNodeType;
      },
      canDeleteEdge: (selected) => {
//        console.warn ('canDeleteEdge',{selected})
	return false;
      },
      afterRenderEdge: (id, element, edge, edgeContainer, isEdgeSelected) => {
//        console.warn ('afterRenderEdge', {id, element, edge, edgeContainer, isEdgeSelected})

      },
      onUpdateNode: (node) => {
        if (node.x !== node.orig.x || node.y !== node.orig.y) {
          this.graph.updateNodeCoord (node);
          this.updateGraph();
        }
      },
      onSelectNode: (node) => {
        this.setSelected (node
                          ? { node: node.id }
                          : {});
      },
      onSelectEdge: (edge) => {
        this.setSelected (edge
                          ? { edge: { source: edge.source,
                                      target: edge.target,
                                      link: edge.link } }
                          : {});
      }
    };
  }

  // <textarea> for selected node/edge
  selectionTextArea (graph) {
    this.assertSelectionValid (graph);
    return (<NodeEditor
            setEditorState={(s)=>this.setEditorState(s)}
            content={this.state.editorContent}
            selection={this.state.editorSelection}
            disabled={this.state.editorDisabled}
            focus={this.state.editorFocus} />);
  }

  assertSelectionValid (graph) {
    if (this.props && this.props.selected) {
      if (this.props.selected.node && !graph.selectedNode (this.props.selected))
        console.error("Lost selected.node",this.props.selected.node);
      if (this.props.selected.edge && !graph.selectedEdge (this.props.selected))
        console.error("Lost selected.edge",this.props.selected.edge);
    } else
      throw new Error ('no props.selected');
  }
  
  // Render graph
  render() {
    const nodeTypes = fromEntries (
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
                         <rect x="0" y="0" width="150" height="60" style={{fill:'none',stroke:'none'}}></rect>
                         <rect x="0" y="0" width="80" height="60" className={nodeClass}></rect>
                         <rect x="70" y="0" width="80" height="60" className={nodeClass}></rect>
                         <rect x="0" y="0" width="80" height="60" className={nodeClass} style={{stroke:'none'}}></rect>
                         <rect x="70" y="0" width="80" height="60" className={nodeClass} style={{stroke:'none'}}></rect>
                         </symbol>
	             )
                     : (
                         <symbol viewBox="0 0 150 60" id={node.type} key="0">
                         <rect x="0" y="0" width="150" height="60" className={nodeClass}></rect>
                         </symbol>
	             ))
           })];
        }));
    const edgeTypes = fromEntries (['',this.graph.selectedEdgeTypeSuffix].reduce ((a, selectedSuffix) => a.concat ([
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
    const handler = this.eventHandlers(this.graph);
    return (<div>
            <div className="mapview">
	    <GraphView
            nodeKey="id"
	    nodes={this.state.nodes}
	    edges={this.state.edges}
	    edgeTypes={edgeTypes}
	    nodeTypes={nodeTypes}
	    nodeSubtypes={{}}
            selected={this.state.selected && (this.state.selected.node || this.state.selected.edge)}
            nodeSize={this.graph.nodeSize}
            edgeHandleSize={this.graph.edgeHandleSize}
            edgeArrowSize={this.graph.edgeArrowSize}
            onUpdateNode={handler.onUpdateNode}
            onSelectNode={handler.onSelectNode}
            onSelectEdge={handler.onSelectEdge}
            onCreateNode={handler.onCreateNode}
            onDeleteNode={handler.onDeleteNode}
            onCreateEdge={handler.onCreateEdge}
            onSwapEdge={handler.onSwapEdge}
            onDeleteEdge={handler.onDeleteEdge}
            canSwapEdge={handler.canSwapEdge}
            canDeleteNode={handler.canDeleteNode}
            canCreateEdge={handler.canCreateEdge}
            canDeleteEdge={handler.canDeleteEdge}
            afterRenderEdge={handler.afterRenderEdge}
	    zoomLevel="1"
	    />
            </div>
            <div className="editorcontainer">
	    {this.selectionTextArea (this.graph)}
            </div>
            <div style={{'fontSize':'small'}}>
            {this.state.text}
            </div>
	    </div>);
  }
}

export default MapView;
