define([
  'app',
  'backbone',
  'underscore',
  'core/t',
  'core/notification'
],

function(app, Backbone, _, __t, Notification) {

  'use strict';

  var TableHeadView = Backbone.Layout.extend({

    template: 'tables/table-head',

    tagName: 'thead',

    events: {
      'click input.js-select-all-row': function () {
        var checkAll = this.checkedAll = this.$('#checkAll:checked').prop('checked') !== undefined;
        var bodyView = this.parentView.tableBodyView;
        var $inputs = bodyView.$('input.js-select-row');

        bodyView.selectedIds = [];
        $inputs.prop('checked', checkAll).trigger('changed');

        if (checkAll) {
          $inputs.each(function () {
            var $row = $(this).closest('tr');
            // TODO: Put ID into the checkbox and avoid querying it everytime
            bodyView.selectedIds.push($row.data('id'));
          });
        }

        this.collection.trigger('select');
      },

      'click .js-more': 'showMore',

      'click th:not(.js-check, .js-sort-toggle, .visible-columns-cell)': function(event) {
        var collection = this.getCollection();
        var column = $(event.currentTarget).data('id');
        var order = collection.getOrder();
        var order_sort = 'ASC';
        var isDefaultSorting = (order.sort === column && order.sort_order !== order_sort);
        var structure = collection.junctionStructure || collection.structure;
        var defaultSortColumn = structure.where({column_name: 'sort'}).length ? 'sort' : 'id';

        if (column === 'sort' || isDefaultSorting) {
          collection.setOrder(defaultSortColumn, order_sort);
          this.parentView.fixWidths();
          return;
        }

        if (column !== order.sort) {
          collection.setOrder(column, order_sort);
        } else {
          if(order.sort_order === order_sort) {
            order_sort = 'DESC';
          }
          collection.setOrder(column, order_sort);
        }

        this.parentView.fixWidths();
      },

      'click #set-visible-columns': function() {
        if(this.visibleColumnsView) {
          this.visibleColumnsView = null;
          this.removeView('#visible_columns_entry');
          this.$el.closest('thead').removeClass('force-hover');
          return;
        } else {
          this.$el.closest('thead').addClass('force-hover');
        }

        var collection = this.getCollection();
        var structure = collection.structure;
        var preferences = collection.preferences;
        var visibleColumns = preferences.get('columns_visible').split(',');
        var data = {};
        var totalSelected = 0;

        data.columns = structure.chain()
          .filter(function(model) {
            return !model.get('system') && !model.get('hidden_list') && !model.get('hidden_input');
          })
          .map(function(model) {
            var isVisible = _.contains(visibleColumns, model.id);
            var isForeign = _.contains(['MANYTOMANY', 'ONETOMANY'],
                                       model.getRelationshipType());

            if (isVisible) {
              totalSelected++;
            }

            return {
              name: model.id,
              visible: isVisible,
              disabled: isForeign,
              isForeign: isForeign
            };
          }, this)
          .value();

        if (totalSelected >= this.maxColumns) {
          data.columns = _.map(data.columns, function(column) {
            if (!column.visible) {
              column.disabled = true;
            }
            return column;
          });
        }

        data.maxColumns = this.maxColumns;

        var View = Backbone.Layout.extend({

          events: {
            'click input': function() {
              var checkedInputs = this.$el.find('input:checked'),
                  maxColumns = this.options.data.maxColumns;

              if (checkedInputs.length >= maxColumns) {
                this.disableNonSelected();
              } else {
                this.enableNonSelected();
              }
            },
            'click #saveVisibleColumnsBtn': function() {
              this.save();
            },
            'click #cancelVisibleColumnsBtn': function() {
              this.cancelSelection();
            }
          },

          disableNonSelected: function() {
            this.$el.find('input:not(:checked)').each(function(i, el) {
              $(el).prop('disabled', true);
            });
          },

          enableNonSelected: function() {
            this.$el.find('input:disabled').each(function(i, el) {
              var $el = $(el);
              if (!$el.attr('data-foreign')) {
                $el.prop('disabled', false);
              }
            });
          },

          template: 'tables/table-set-columns',

          serialize: function() {
            return this.options.data;
          }

        });

        this.visibleColumnsView = new View({data: data});

        var that = this;

        this.visibleColumnsView.cancelSelection = function() {
          that.visibleColumnsView = null;
          this.remove();
          that.$el.closest('thead').removeClass('force-hover');
        };

        this.visibleColumnsView.save = function() {
          var data = this.$el.find('form').serializeObject();
          var string = _.isArray(data.columns_visible) ? data.columns_visible.join(',') : data.columns_visible;
          var that2 = this;

          preferences.save({'columns_visible': string},{
            success: function() {
              collection.trigger('visibility');
              that2.cancelSelection();
            }
          });

          that.collection.filters.columns_visible = data.columns_visible;
          that.collection.fetch();
        };

        this.render();
      },

      'click .js-sort-toggle': function () {
        this.parentView.toggleSortable();
      },
      'click th:not(.js-sort-toggle)': function () {
        if (this.parentView.sortableWidget && this.parentView.sortableWidget.options.sort) {
          this.$el.closest('table').addClass('disable-sorting');
          this.parentView.sortableWidget.options.sort = false;
          Notification.info(__t('table_sort_disabled'), '<i>'+__t('table_sort_disabled_message')+'</i>', {timeout: 3000});
        }
      }
    },

    showMore: function () {
      this.parentView.trigger('onShowMore');
    },

    beforeRender: function() {
      if(this.visibleColumnsView) {
        this.setView('#visible_columns_entry', this.visibleColumnsView);
      }
    },

    serialize: function() {
      var order = this.getCollection().getOrder();
      var blacklist = this.options.blacklist;

      // get whitelisted columns first
      var columns = _.filter(this.parentView.getTableColumns(), function(column) {
        return ! _.contains(blacklist, column);
      });

      columns = _.map(columns, function(column) {
        return {name: column, orderBy: column === order.sort, desc: order.sort_order === 'DESC'};
      });

      return {
        status: this.parentView.options.status,
        checkedAll: this.checkedAll,
        selectable: this.options.selectable,
        sortable: this.options.sort,
        columns: columns,
        showItemNumbers: this.options.showItemNumbers,
        deleteColumn: this.options.deleteColumn,
        showMoreButton: this.options.showMoreButton,
        showRemoveButton: this.parentView.options.showRemoveButton,
        hideColumnPreferences: this.options.hideColumnPreferences
      };
    },

    getCollection: function () {
      return this.options.system === true ? this.options.systemCollection : this.collection;
    },

    initialize: function (options) {
      var collection = this.getCollection();

      this.parentView = options.parentView;
      this.maxColumns = this.options.maxColumns || 8;

      if (collection.preferences) {
        collection.filters.columns_visible = [];
        collection.preferences.get('columns_visible').split(',').forEach(function(column) {
          //Only add columns that actually exist
          if (collection.structure.get(column) !== undefined) {
            collection.filters.columns_visible.push(column);
          }
        });
      }

      this.listenTo(this.getCollection(), 'sort', this.render);
    }

  });

  return TableHeadView;

});
