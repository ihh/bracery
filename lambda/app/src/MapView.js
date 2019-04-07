import React, { Component } from 'react';
import { ParseTree } from 'bracery';
import { extend } from './bracery-web';
//import GraphView from 'react-digraph';
import GraphView from './react-digraph/components/graph-view';
import NodeEditor from './NodeEditor';
import ParseGraph from './ParseGraph';
import { fromEntries } from './fromEntries';

import './MapView.css';

// MapView
class MapView extends Component {
  constructor(props) {
    super(props);
    this.ParseTree = ParseTree;
  }

  replaceLink (graph, linkNode, changedPos, newLinkText, newLinkTargetText) {
    changedPos = changedPos || linkNode.pos;
    return this.replaceText (graph.text,
                             [{ startOffset: changedPos[0],
                                endOffset: changedPos[0] + changedPos[1],
                                replacementText: this.makeLinkBracery (linkNode,
                                                                       typeof(newLinkText) === 'undefined'
                                                                       ? linkNode.defText
                                                                       : newLinkText,
                                                                       typeof(newLinkTargetText) === 'undefined'
                                                                       ? linkNode.defText
                                                                       : newLinkTargetText) }]);
  }

  replaceText (text, edits) {
    edits = edits.sort ((a, b) => a.startOffset - b.startOffset);
    edits.forEach ((edit, n) => {
      if (n > 0 && edit.startOffset < edits[n-1].endOffset)
        throw new Error ("overlapping edits");
    });
    const info = edits.reverse().reduce ((info, edit) => ({ startOffset: edit.startOffset,
                                                            text: edit.replacementText + text.slice (edit.endOffset, info.startOffset) + info.text }),
                                         { startOffset: text.length,
                                           text: '' });
    return text.slice (0, info.startOffset) + info.text;
  }

  // State modification
  setEvalText (newEvalText) {
    this.props.setAppState ({ evalText: newEvalText });
  }

  setSelected (graph, selected) {
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
    this.props.setAppState ({ mapSelection: selected,
                              editorContent: editorContent,
                              editorSelection: editorSelection,
                              editorDisabled: editorDisabled,
                              editorFocus: ((selected.node || selected.edge) && !editorDisabled) });
  }

  setEditorState (graph, selectedNode, selectedEdge, selectedEdgeSource, selectedEdgeLink, newEditorState, callback) {
    const appProp = { focus: 'editorFocus',
                      content: 'editorContent',
                      selection: 'editorSelection' };
    let newAppState = fromEntries (
      Object.keys(appProp)
        .filter ((prop) => newEditorState.hasOwnProperty(prop))
        .map ((prop) => [appProp[prop], newEditorState[prop]]));
    if (newEditorState.hasOwnProperty('content')) {
      if (selectedEdge && selectedEdge.edgeType === this.linkEdgeType) {
        newAppState.evalText = this.replaceLink (graph, selectedEdgeLink, selectedEdge.pos, newEditorState.content);
      } else {
        const oldNode = selectedNode || selectedEdgeSource;
        if (oldNode) {
          const newNode = extend ({},
                                  oldNode,
                                  { rhs: [newEditorState.content],
                                    nodeType: (oldNode.nodeType === this.placeholderNodeType
                                               ? this.definedNodeType
                                               : oldNode.nodeType) });
          graph.nodes = graph.nodes.map ((node) => (node === oldNode ? newNode : node));
          newAppState.evalText = this.rebuildBracery (graph, newNode);
        }
      }
    }
    this.props.setAppState (newAppState, callback);
  }

  createNode (graph, x, y) {
    const id = this.newVar (graph.isVarName);
    let newNode = { id: id,
                    x: Math.round(x),
                    y: Math.round(y),
                    type: this.definedNodeType,
                    nodeType: this.definedNodeType,
                    typeText: ParseTree.traceryChar + id + ParseTree.traceryChar,
                    title: this.emptyNodeText,
                    rhs: [] };
    graph.nodes.push (newNode);
    const newEvalText = this.rebuildBracery (graph, newNode);
    this.props.setAppState ({ mapSelection: { node: id },
                              editorContent: '',
                              editorSelection: { startOffset: 0, endOffset: 0 },
                              editorDisabled: false,
                              editorFocus: true,
                              evalText: newEvalText });
  }

  createEdge (graph, source, target) {
    let newSource = this.findNodeByID (graph, source.id);
    let newEdge = { source: source.id,
		    target: target.id,
                    type: this.linkEdgeType };
    this.addEdge (graph.edges, newEdge);

    let link = null, linkText = null;
    if (target.nodeType === this.externalNodeType) {
      linkText = target.id.replace(graph.SYM_PREFIX,'');
      link = this.makeLinkBracery (null, linkText, ParseTree.symChar + linkText);
    } else
      link = '[[' + (linkText = target.id) + ']]';
    newSource.rhs = [this.implicitBracery (graph, newSource) + link];
    
    const newEvalText = graph.rebuildBracery();

    this.props.setAppState ({ mapSelection: { edge: { source: source.id,
						      target: target.id } },
                              editorContent: linkText,
                              editorSelection: { startOffset: linkText.length, endOffset: linkText.length },
                              editorDisabled: false,
                              editorFocus: true,
                              evalText: newEvalText });
    
  }
  
  swapEdge (graph, sourceNode, targetNode, edge) {
    const newTargetText = this.makeLinkTargetBracery (targetNode);
    const newEvalText = (edge.edgeType === this.includeEdgeType
                         ? this.replaceText (graph.text,
                                             [{ startOffset: edge.pos[0],
                                                endOffset: edge.pos[0] + edge.pos[1],
                                                replacementText: newTargetText }])
                         : this.replaceLink (graph, this.findNodeByID (graph, edge.link), edge.pos, undefined, newTargetText));

    this.props.setAppState ({ evalText: newEvalText,
                              mapSelection: {},
                              editorContent: '',
                              editorSelection: { startOffset: 0, endOffset: 0 },
                              editorDisabled: true,
                              editorFocus: false });
  }

  // Event handlers
  eventHandlers (graph) {
    return {
      onCreateNode: (x, y, event) => {
//        console.warn ('onCreateNode',{x,y,event});
        this.createNode (graph, x, y);
      },
      onDeleteNode: (selected, nodeId, nodes) => {
        console.warn ('onDeleteNode',{selected,nodeId,nodes})
	console.error ('onDeleteNode should be unreachable through the UI');
      },
      onCreateEdge: (sourceNode, targetNode) => {
//        console.warn ('onCreateEdge',{sourceNode, targetNode})
	this.createEdge (graph, sourceNode, targetNode);
      },
      canSwapEdge: (sourceNode, targetNode, edge) => {
//        console.warn ('canSwapEdge',{sourceNode, targetNode, edge})
        return targetNode.nodeType !== this.implicitNodeType;
      },
      onSwapEdge: (sourceNode, targetNode, edge) => {
//        console.warn ('onSwapEdge',{sourceNode, targetNode, edge})
        this.swapEdge (graph, sourceNode, targetNode, edge);
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
	  sourceNode = typeof(sourceNode) === 'object' ? sourceNode : this.findNodeByID (graph, sourceNode);
	  return sourceNode && sourceNode.nodeType !== this.placeholderNodeType;
	}
	return targetNode.nodeType !== this.implicitNodeType;
      },
      canDeleteEdge: (selected) => {
//        console.warn ('canDeleteEdge',{selected})
	return false;
      },
      afterRenderEdge: (id, element, edge, edgeContainer, isEdgeSelected) => {
//        console.warn ('afterRenderEdge', {id, element, edge, edgeContainer, isEdgeSelected})

      },
      onUpdateNode: (node) => {
        if (node.x !== node.orig.x || node.y !== node.orig.y)
          this.setEvalText (this.rebuildBracery (graph, node));
      },
      onSelectNode: (node) => {
        this.setSelected (graph,
                          node
                          ? { node: node.id }
                          : {});
      },
      onSelectEdge: (edge) => {
        this.setSelected (graph,
                          edge
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
            setEditorState={(newEditorState)=>this.setEditorState(graph,graph.selectedNode(),graph.selectedEdge(),graph.selectedEdgeSourceNode(),graph.selectedEdgeLinkNode(),newEditorState)}
            content={this.props.editorContent}
            selection={this.props.editorSelection}
            disabled={this.props.editorDisabled}
            focus={this.props.editorFocus} />);
  }

  assertSelectionValid (graph) {
    if (this.props && this.props.selected) {
      if (this.props.selected.node && !graph.selectedNode (this.props.selected.node))
        console.error("Lost selected.node",this.props.selected.node);
      if (this.props.selected.edge && !graph.selectedEdge (this.props.selected.edge))
        console.error("Lost selected.edge",this.props.selected.edge);
    } else
      throw new Error ('no props.selected');
  }
  
  // Render graph
  render() {
    const rhs = this.props.rhs;
    const text = this.props.evalText;
    const name = this.props.name;
    const selected = this.props.selected;
    const graph = new ParseGraph ({ rhs, text, name, selected });
//    console.warn('start node:',graph.nodes[0].x,graph.nodes[0].y);
    console.warn(graph);
    //    console.dir(selected);
    const nodeTypes = fromEntries (
      graph.nodes.map (
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
	     shape: (node.nodeType === this.implicitNodeType
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
    const edgeTypes = fromEntries (['',graph.selectedEdgeTypeSuffix].reduce ((a, selectedSuffix) => a.concat ([
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
    const handler = this.eventHandlers(graph);
    return (<div>
            <div className="mapview">
	    <GraphView
            nodeKey="id"
	    nodes={graph.nodes}
	    edges={graph.edges}
	    edgeTypes={edgeTypes}
	    nodeTypes={nodeTypes}
	    nodeSubtypes={{}}
            selected={this.props.selected && (this.props.selected.node || this.props.selected.edge)}
            nodeSize={this.nodeSize}
            edgeHandleSize={this.edgeHandleSize}
            edgeArrowSize={this.edgeArrowSize}
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
	    {this.selectionTextArea (graph)}
            </div>
	    </div>);
  }
}

export default MapView;
