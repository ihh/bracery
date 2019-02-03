;; https://www.emacswiki.org/emacs/ModeTutorial
;; http://ergoemacs.org/emacs/elisp_syntax_coloring.html

(defvar bracery-mode-hook nil)

(defvar bracery-mode-map
  (let ((map (make-keymap)))
    (define-key map "\C-j" 'newline-and-indent)
    map)
  "Keymap for bracery major mode")

;;;###autoload
(add-to-list 'auto-mode-alist '("\\.bracery\\'" . bracery-mode))

(setq bracery-field-regexp "#[a-z0-9]+ +\\(.*\\)")

(setq bracery-highlights
      '(("^#.*" . font-lock-comment-face)
	("^\\([0-9\.]*\\)\\(\\|@[A-Za-z0-9_,]+\\)\\(>+\\)\\(.*?\\) *\\(#\\) *\\(.*?\\) *\\(#\\) *\\(.*\\)"
	 (1 'highlight t) ;; weight
	 (2 font-lock-warning-face t) ;; author
	 (3 'shadow t) ;; >
	 (4 'match t) ;; title
	 (5 'shadow t) ;; #
	 (6 'custom-state t) ;; past-tags
	 (7 'shadow t) ;; #
	 (8 font-lock-type-face t)) ;; future-tags
	("^\\(>\\)\\([A-Za-z0-9_]+\\) *$" (1 'underline t) (2 'link-visited t))
        ("{[^][|]*|[^][|}]*}?" . font-lock-builtin-face)
        ("[|[][^][|}]*}?" . font-lock-builtin-face)
        ("]" . font-lock-builtin-face)
        ("&~?[A-Za-z0-9_]+{[^}]*}{[^}]*}" . font-lock-function-name-face)
        ("&~?[A-Za-z0-9_]+{[^}]*}" . font-lock-function-name-face)
        ("#\\([A-Za-z0-9_]+\\)#" 1 'italic t)
        ("\\(~[~\\*]?[A-Za-z0-9_]+\\)" 1 'italic t)
        ("\\(~{[A-Za-z0-9_]+\\)}" 1 'italic t)
        ("\\(~[~\\*][A-Za-z0-9_]+\\)" 1 'bold-italic t)
        ("#[#\*][A-Za-z0-9_]+" . font-lock-type-face)  ;; ##TAG or #*TAG
        ("=[^{ ]+" . font-lock-type-face)
        ("={.*}" . font-lock-type-face)
        (":=[^{ ]+" . font-lock-type-face)
        (":={.*}" . font-lock-type-face)
        ("$[A-Za-z0-9_]+" 0 font-lock-variable-name-face t)
        ("${[A-Za-z0-9_]+}" 0 font-lock-variable-name-face t)
        ("&[A-Za-z0-9_]+" 0 font-lock-keyword-face t)
        ))

(defvar bracery-mode-syntax-table
  (let ((st (make-syntax-table)))
    (modify-syntax-entry ?\" "." st)
    (modify-syntax-entry ?_ "w" st)
    st)
  "Syntax table for bracery-mode")

(defun bracery-mode ()
  "Major mode for editing bracery files"
  (interactive)
  (kill-all-local-variables)
  (set-syntax-table bracery-mode-syntax-table)
  (use-local-map bracery-mode-map)
  (setq font-lock-defaults '(bracery-highlights))
  (set-syntax-table bracery-mode-syntax-table)
  (setq mode-name "bracery")
  (run-hooks 'bracery-mode-hook))

(provide 'bracery-mode)
