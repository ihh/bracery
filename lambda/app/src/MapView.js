import React, { Component } from 'react';
import { ParseTree } from 'bracery';
import { extend } from './bracery-web';
import { GraphView } from 'react-digraph';

import './MapView.css';

// Object.fromEntries
const fromEntries = (props_values) => {
  var obj = {};
  props_values.forEach ((prop_value) => {
    obj[prop_value[0]] = prop_value[1];
  })
  return obj;
};

// SelectionTextArea
class SelectionTextArea extends Component {
  render() {
    const mapview = this.props.mapview;
    const text = this.props.text;
    return (<textarea
            ref={c => { this.textarea = c; }}
            className="rhs"
            value={text}
            onChange={(event)=>mapview.rhsChanged(event)} />);
  }

  setSelection() {
    if (this.props.selected) {
      this.textarea.focus();
      if (this.props.range)
        this.textarea.setSelectionRange (this.props.range[0], this.props.range[0] + this.props.range[1]);
    }
  }
  
  componentDidMount() {
    this.setSelection()
  }

  componentDidUpdate() {
    this.setSelection()
  }
}

// MapView
class MapView extends Component {
  constructor(props) {
    super(props);
    this.state = {
      selected: {},
    }
  };

  // Constants
  get START() { return 'START'; }
  get SYM_PREFIX() { return 'SYM_'; }

  get layoutRadius() { return 300; }
  get layoutRadiusMultiplier() { return 0.8; }
  get maxNodeTitleLen() { return 24; }
  get maxEdgeHandleLen() { return 10; }

  get startNodeType() { return 'start'; }
  get definedNodeType() { return 'defined'; }
  get externalNodeType() { return 'external'; }
  get placeholderNodeType() { return 'placeholder'; }

  get placeholderNodeText() { return 'Click to edit'; }
  get emptyNodeText() { return '(empty)'; }

  get includeEdgeType() { return 'include'; }
  get linkEdgeType() { return 'link'; }
  get selectedEdgeTypeSuffix() { return 'Selected'; }

  // Helpers
  truncate (text, len) {
    return (text.length <= len
            ? text
            : (text.substr(0,len) + '...'))
  }

  // graphNodeText is to be called on a graph node
  graphNodeText (node) {
    return this.nodeText(node) + (node.nodeType === this.startNodeType
                                  ? this.nodesText(node.rhs)
                                  : '')
  }
  
  // nodeText is to be called on a Bracery parse tree node (it references the "pos" attribute)
  // It is also called by graphNodeText on graph nodes, which copy the parse tree node's "pos"
  nodeText (node) {
    return (typeof(node) === 'string'
            ? node
            : (node && node.pos
               ? this.props.evalText.substr (node.pos[0], node.pos[1]).replace (/^{([\s\S]*)}$/, (_m,c)=>c)
               : ''));
  }

  // nodesText is to be called on an array of Bracery parse tree nodes
  nodesText (nodes) {
    const mv = this;
    return nodes.reduce((pre,node) => pre + mv.nodeText(node),'') || ''
  }
  
  startNodeText (graph) {
    return this.nodesText (graph.nodes[0].rhs)
  }
  
  nodeInSubtree (node, subtreeRoot) {
    while (node) {
      if (node === subtreeRoot)
	return true;
      node = node.parent;
    }
    return false;
  }

  makeNodeBracery (node, dx, dy) {
    const x = Math.round(node.x + (dx || 0)), y = Math.round(node.y + (dy || 0));
    switch (node.nodeType) {
    case this.externalNodeType:
      return '&placeholder' + ParseTree.symChar + node.id.replace(this.SYM_PREFIX,'') + '{' + x + ',' + y + '}\n';
    case this.placeholderNodeType:
      return '&placeholder' + ParseTree.varChar + node.id + '{' + x + ',' + y + '}\n';
    case this.startNodeType:
      return '&placeholder{' + x + ',' + y + '}\n';
    case this.definedNodeType:
      return '[' + node.id + '@' + x + ',' + y + '=>' + this.nodesText (node.rhs) + ']\n';
    default:
      return '';
    }
  }

  selectedNode (graph) {
    return (this.state.selected.node
            ? graph.nodeByID[this.state.selected.node]
            : (this.state.selected.edge
               ? graph.nodeByID[this.state.selected.edge.source]
               : null));
  }

  selectedEdges (graph) {
    return (this.state.selected.edge
            ? (graph.edgesBySourceTargetID[this.state.selected.edge.source][this.state.selected.edge.target] || [])
            : null);
  }

  selectedNodeText (graph) {
    const node = this.selectedNode (graph);
    return node ? this.nodesText (node.rhs) : '';
  }

  // Modify App state
  setEvalText (newEvalText) {
    this.props.app.setState ({ evalText: newEvalText });
  }

  setSelected (sel) {
    this.setState ({ selected: sel });
  }

  // Get graph by analyzing parsed Bracery expression
  getLayoutGraph() {
    const mv = this;
    const rhs = this.props.rhs;
    const text = this.props.evalText;
    const symName = this.props.name;
    const selected = this.state.selected;
    const startNodeName = this.SYM_PREFIX + symName;
    // Scan parsed Bracery code for top-level global variable assignments of the form $variable=&quote{...} or $variable=&let$_xy{...}&quote{...}
    let nodeOffset = 0, nodes = [], edges = [], startRhs = [];
    while (nodeOffset < rhs.length) {
      let braceryNode = rhs[nodeOffset];
      if (ParseTree.isQuoteAssignExpr (braceryNode)
          || ParseTree.isLayoutAssign (braceryNode)
          || ParseTree.isPlaceholderExpr (braceryNode)) {
        let node = { pos: braceryNode.pos }, coord = null;
        if (ParseTree.isPlaceholderExpr (braceryNode)) {
	  const heldNode = ParseTree.getPlaceholderNode (braceryNode);
	  const heldNodeType = heldNode && heldNode.type;
	  coord = ParseTree.getPlaceholderCoord (braceryNode);
	  if (heldNodeType === 'lookup') {
	    node.id = heldNode.varname;
	    node.nodeType = mv.placeholderNodeType;
	  } else if (heldNodeType === 'sym') {
	    node.id = mv.SYM_PREFIX + heldNode.name;
	    node.nodeType = mv.externalNodeType;
	  } else {
	    node.id = startNodeName;
	    node.nodeType = mv.startNodeType;
	  }
	  node.rhs = [];
        } else {
	  node.id = braceryNode.varname.toLowerCase();
          node.nodeType = this.definedNodeType;
	  if (ParseTree.isLayoutAssign (braceryNode)) {
	    let expr = ParseTree.getLayoutExpr (braceryNode);
	    coord = ParseTree.getLayoutCoord (expr);
	    node.rhs = ParseTree.getLayoutContent (expr);
	  } else
	    node.rhs = ParseTree.getQuoteAssignRhs (braceryNode);
        }
        if (coord) {
	  const xy = coord.split(',');
	  node.x = parseFloat (xy[0]);
	  node.y = parseFloat (xy[1]);
        }
        nodes = nodes.filter ((n) => n.id !== node.id);
        if (node.nodeType === this.startNodeType)
	  nodes = [node].concat (nodes);
        else
	  nodes.push (node);
      } else if (ParseTree.isStaticExpr ([braceryNode]))
        startRhs.push (braceryNode);
      else
        break;
      ++nodeOffset;
    }

    // Add a start node for everything that is *not* part of a top-level global variable assignment
    let nodeByID = {};
    nodes.forEach ((node) => nodeByID[node.id] = node);
    if (!nodeByID[startNodeName]) {
      const startNode = { id: startNodeName,
	                  pos: [0, 0],
                          nodeType: this.startNodeType };
      nodes = [startNode].concat (nodes);
      nodeByID[startNodeName] = startNode;
    }
    nodes[0].rhs = startRhs.concat (rhs.slice (nodeOffset));

    // Do some analysis of outgoing edges
    const getTargetNodes = (node, config, namePrefix) => {
      return ParseTree.getSymbolNodes (node.rhs, config)
        .map ((target) => extend (target, { graphNodeName: (namePrefix || '') + target.name.toLowerCase() }))
        .filter ((target) => target.graphNodeName !== node.id);
    };
    const getIncludedNodes = (node) => getTargetNodes (node, { traceryOnly: true, ignoreLink: true });
    const getLinkedNodes = (node) => getTargetNodes (node, { traceryOnly: true, linkOnly: true, addLinkInfo: true });
    const getExternalNodes = (node, linkFlag) => getTargetNodes (node,
                                                                 extend ({ ignoreTracery: true },
                                                                         typeof(linkFlag) === 'undefined'
                                                                         ? {}
                                                                         : (linkFlag
                                                                            ? { linkOnly: true, addLinkInfo: true }
                                                                            : { ignoreLink: true })),
                                                                 this.SYM_PREFIX)
    
    // Create placeholders for unknown & external nodes
    const createPlaceholders = (getter, attrs) => (node) => {
      getter(node).forEach ((target) => {
	const targetNode = nodeByID[target.graphNodeName];
        if (targetNode) {
	  if (!targetNode.parent && targetNode.nodeType !== mv.startNodeType)
	    targetNode.parent = node;
	} else {
	  const newNode = extend ({ id: target.graphNodeName,
                                    pos: [0, 0],
                                    parent: node,
                                    rhs: [] },
				  attrs);
          nodes.push (newNode);
          nodeByID[target.graphNodeName] = newNode;
        }
      });
    }
    nodes.forEach (createPlaceholders (getIncludedNodes, { nodeType: mv.placeholderNodeType }));
    nodes.forEach (createPlaceholders (getLinkedNodes, { nodeType: mv.placeholderNodeType }));
    nodes.forEach (createPlaceholders (getExternalNodes, { nodeType: mv.externalNodeType }));

    // Do some common initializing, and create edges
    let childPos = fromEntries (nodes.map ((node) => [node.id, {}]));
    let edgesBySourceTargetID = fromEntries (nodes.map ((node) => [node.id, {}]));
    const addEdge = ((edge) => {
      edges.push (edge);
      let ebs = edgesBySourceTargetID[edge.source];
      ebs[edge.target] = (ebs[edge.target] || []).concat ([edge]);
      let srcChildPos = childPos[edge.source];
      if (!srcChildPos[edge.target])
	srcChildPos[edge.target] = Object.keys(srcChildPos).length;
    });
    nodes.forEach ((node) => {
      node.type = node.id;
      node.title = this.truncate ((node.nodeType === mv.externalNodeType
                                   ? ''
                                   : (node.nodeType === mv.placeholderNodeType
                                      ? mv.placeholderNodeText
                                      : (mv.nodesText (node.rhs)
                                         || mv.emptyNodeText))),
                                  this.maxNodeTitleLen);
      // Create outgoing edges
      getIncludedNodes (node)
        .concat (getExternalNodes (node, false))
        .forEach ((target) => addEdge ({ source: node.id,
                                         target: target.graphNodeName,
                                         type: mv.includeEdgeType,
                                         pos: target.pos }));
      getLinkedNodes (node)
        .concat (getExternalNodes (node, true))
        .forEach ((target) => addEdge ({ source: node.id,
                                         target: target.graphNodeName,
                                         type: mv.linkEdgeType,
                                         pos: target.link.pos,
                                         handleText: this.truncate (mv.nodeText (target.linkText) || node.id,
                                                                    this.maxEdgeHandleLen) }));
    });
    
    // Create tree structure
    // Ensure every node (except start) has a parent, and sort children by the order that the parent->child edges appear
    // This keeps the automatic hierarchical layout stable when we add placeholders, etc.
    nodes.forEach ((node) => node.children = []);
    nodes.forEach ((node, n) => {
      if (n > 0) {
	node.parent = node.parent || nodes[0];  // if a node is not referenced by any other node, set its parent to be the start node
	node.parent.children.push (node);
      }
      node.depth = 0;
      for (let n = node; n.parent; n = n.parent)
	++node.depth;
    });
    nodes.forEach ((node) => {
      node.children = node.children.sort ((a,b) => childPos[node.id][a.id] - childPos[node.id][b.id]);
      node.children.forEach ((child, n) => { if (child.parent === node) child.childIndex = n; });
    });

    // Lay things out
    const layoutNode = (node) => {
      // If no (x,y) specified, lay out nodes on a circle of radius layoutRadius/2^(depth-1) around the parent node
      if (typeof(node.x) === 'undefined') {
        if (node.parent) {
	  layoutNode (node.parent);
	  const rankOffset = (node.parent.depth ? ((1 - 1/node.parent.children.length)/2) : 0), angleRange = Math.PI * (node.parent.depth ? (1/3) : 2);
	  const angleOffset = (node.parent.depth
			       ? Math.atan2 (node.parent.y - node.parent.parent.y, node.parent.x - node.parent.parent.x)
			       : 0);
	  const angle = angleOffset + angleRange * (node.childIndex / node.parent.children.length + rankOffset);
	  const radius = mv.layoutRadius * Math.pow (mv.layoutRadiusMultiplier, node.depth - 1);
	  node.x = node.parent.x + Math.cos(angle) * radius;
	  node.y = node.parent.y + Math.sin(angle) * radius;
        } else
          node.x = node.y = 0;
	node.autoLayout = true;
      }
    };
    nodes.forEach (layoutNode);

    // Mark selected node/edge
    if (selected.node)
      nodeByID[selected.node].selected = true;
    else if (selected.edge) {
      (edgesBySourceTargetID[selected.edge.source][selected.edge.target] || [])
        .forEach ((edge) => {
          edge.selected = true;
          edge.type += mv.selectedEdgeTypeSuffix;
        });
      nodeByID[selected.edge.source].selectedOutgoingEdge = true;
      nodeByID[selected.edge.target].selectedIncomingEdge = true;
    }
    
    // Return
    return { nodes,
	     edges,
             nodeByID,
             edgesBySourceTargetID,
             text };
  }

  // Event handlers
  onUpdateNode (graph, node) {
    const mv = this;
    const newEvalText = graph.nodes.map ((graphNode) => (
      mv.nodeInSubtree (graphNode, node)
	? mv.makeNodeBracery(graphNode)
	: mv.nodeText(graphNode)
    )).join('') + this.startNodeText(graph)
    this.setEvalText (newEvalText);
  }

  onSelectNode (graph, node) {
    this.setSelected (node
                      ? { node: node.id }
                      : {});
  }

  onSelectEdge (graph, edge) {
    this.setSelected (edge
                      ? { edge: { source: edge.source,
                                  target: edge.target } }
                      : {});
  }

  rhsChanged (event) {
    let text = event.target.value;
    console.warn('rhsChanged',text)
  }

  // <textarea> for selected node/edge
  selectionTextArea (graph) {
    const text = this.selectedNodeText(graph);
    let range = null;
    if (this.state.selected.edge) {
      const selectedEdges = this.selectedEdges(graph);
      if (selectedEdges.length === 1)
        range = this.calculateSelectionRange (this.selectedNode(graph).rhs, selectedEdges[0].pos);
    }
    return (<SelectionTextArea
            selected={!!this.selectedNode(graph)}
            mapview={this}
            text={text}
            range={range} />);
  }

  calculateSelectionRange (rhs, pos) {
    let offset = 0, range = null;
    range = rhs.reduce ((r, rhsNode) => {
      if (!r) {
        if (typeof(rhsNode) === 'string')
          offset += rhsNode.length;
        else if (rhsNode.pos) {
          if (pos[0] >= rhsNode.pos[0] && pos[0] < rhsNode.pos[0] + rhsNode.pos[1])
            r = [offset + pos[0] - rhsNode.pos[0], pos[1]];
          else
            offset += rhsNode.pos[1];
        } else
          console.error ('rhsNode without pos', rhsNode);
      }
        return r;
    }, range);
    return range;
  }
  
  // Render graph
  render() {
    const rhs = this.props.rhs;
    const graph = this.getLayoutGraph (rhs);
    //    console.warn(graph);
    //    console.warn(selected);
    const nodeTypes = fromEntries (
      graph.nodes.map (
        (node) => [
          node.id,
          ({ shapeId: '#' + node.id,
             typeText: node.id.replace (this.SYM_PREFIX, ParseTree.symChar),
	     shape: (
                 <symbol viewBox="0 0 25 10" id={node.id} key="0">
                 <rect x="0" y="0" width="25" height="10" className={node.nodeType+'-node'+(node.selected
                                                                                            ?' selected-node'
                                                                                            :(node.selectedOutgoingEdge
                                                                                              ?' selected-edge-source-node'
                                                                                              :''))}></rect>
                 </symbol>
	     )
           })]));
    const edgeTypes = fromEntries (['',this.selectedEdgeTypeSuffix].reduce ((a, selectedSuffix) => a.concat ([
      ['include'+selectedSuffix, {
	shapeId: '#includeEdge'+selectedSuffix,
	shape: (
            <symbol viewBox="0 0 50 50" id={'includeEdge'+selectedSuffix} key="0">
            <circle cx="25" cy="25" r="8" className={'includeEdge'+selectedSuffix}></circle>
            </symbol>
	)
      }],
      ['link'+selectedSuffix, {
	shapeId: '#linkEdge'+selectedSuffix,
	shape: (
            <symbol viewBox="0 0 100 100" id={'linkEdge'+selectedSuffix} key="1">
            <circle cx="50" cy="50" r="50" className={'linkEdge'+selectedSuffix}></circle>
            </symbol>
	)
      }]]), []));
    return (<div>
            <div className="mapview">
	    <GraphView
            nodeKey="id"
	    nodes={graph.nodes}
	    edges={graph.edges}
	    edgeTypes={edgeTypes}
	    nodeTypes={nodeTypes}
	    nodeSubtypes={{}}
            onUpdateNode={(node)=>this.onUpdateNode(graph,node)}
            onSelectNode={(node)=>this.onSelectNode(graph,node)}
            onSelectEdge={(edge)=>this.onSelectEdge(graph,edge)}
	    zoomLevel="1"
	    />
            </div>
            <div className="rhscontainer">
	    {this.selectionTextArea (graph)}
            </div>
	    </div>);
  }
}

export default MapView;
