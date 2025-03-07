function loadComments(productId, page = 1) {
    fetch(`/api/products/${productId}/comments?page=${page}`)
      .then(response => response.json())
      .then(data => {
        if (data.status) {
          const container = document.getElementById('comments-container');
          container.innerHTML = '';
  
          data.data.forEach(comment => {
            const isCurrentUser = comment.userId._id === currentUserId;
            const deleteButton = isCurrentUser ? 
              `<button onclick="deleteComment('${comment._id}')" class="btn btn-sm btn-danger float-right">
                 <i class="fa fa-trash"></i>
               </button>` : '';
  
            const commentHtml = `
              <div class="review_item" id="comment-${comment._id}">
                <div class="media">
                  <div class="media-body">
                    <h4>${comment.userId.name}</h4>
                    <small class="text-muted">${new Date(comment.createdAt).toLocaleDateString()}</small>
                    ${deleteButton}
                  </div>
                </div>
                <p>${comment.comment}</p>
              </div>
            `;
            container.innerHTML += commentHtml;
          });
  
          // Update pagination
          updatePagination(data.pagination, productId);
        }
      })
      .catch(error => {
        console.error('Error loading comments:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Failed to load comments'
        });
      });
  }
  
  function submitComment(productId) {
    const commentText = document.getElementById('comment-text').value;
    
    fetch('/api/comments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        productId: productId,
        comment: commentText
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.status) {
        document.getElementById('comment-text').value = '';
        loadComments(productId);
        Swal.fire({
          icon: 'success',
          title: 'Success',
          text: 'Comment added successfully',
          timer: 2000,
          showConfirmButton: false
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: data.message
        });
      }
    })
    .catch(error => {
      console.error('Error submitting comment:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to submit comment'
      });
    });
  }
  
  function deleteComment(commentId) {
    Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        fetch(`/api/comments/${commentId}`, {
          method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
          if (data.status) {
            document.getElementById(`comment-${commentId}`).remove();
            Swal.fire(
              'Deleted!',
              'Your comment has been deleted.',
              'success'
            );
          } else {
            Swal.fire(
              'Error!',
              data.message,
              'error'
            );
          }
        })
        .catch(error => {
          console.error('Error deleting comment:', error);
          Swal.fire(
            'Error!',
            'Failed to delete comment',
            'error'
          );
        });
      }
    });
  }
  
  function updatePagination(pagination, productId) {
    const container = document.getElementById('comments-pagination');
    container.innerHTML = '';
  
    if (pagination.totalPages > 1) {
      let paginationHtml = '<nav><ul class="pagination">';
      
      // Previous button
      paginationHtml += `
        <li class="page-item ${pagination.currentPage === 1 ? 'disabled' : ''}">
          <a class="page-link" href="#" onclick="loadComments('${productId}', ${pagination.currentPage - 1})">&laquo;</a>
        </li>
      `;
  
      // Page numbers
      for (let i = 1; i <= pagination.totalPages; i++) {
        paginationHtml += `
          <li class="page-item ${pagination.currentPage === i ? 'active' : ''}">
            <a class="page-link" href="#" onclick="loadComments('${productId}', ${i})">${i}</a>
          </li>
        `;
      }
  
      // Next button
      paginationHtml += `
        <li class="page-item ${pagination.currentPage === pagination.totalPages ? 'disabled' : ''}">
          <a class="page-link" href="#" onclick="loadComments('${productId}', ${pagination.currentPage + 1})">&raquo;</a>
        </li>
      `;
  
      paginationHtml += '</ul></nav>';
      container.innerHTML = paginationHtml;
    }
  }